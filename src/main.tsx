import './style.css';
import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BVHLoader, BVH } from 'three/addons/loaders/BVHLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

interface CharacterData {
    name: string;
    subtitle: string;
    gltfPath: string;
    portraitPath: string;
    scale: number;
    idleAnimationPath: string;
    rotation?: [number, number, number]; // [x, y, z] in radians
}


const characters: CharacterData[] = [
    {
        name: 'Winter',
        subtitle: 'Waifu',
        gltfPath: 'bestwaifu.glb',
        portraitPath: 'Remy.png',
        scale: 2.5,
        idleAnimationPath: 'Helloidle.bvh',
        rotation: [0, 0, 0], // Stand upright and face the camera
    }
];

let vrmMeshes: THREE.SkinnedMesh[] = [];
let idleBlinker: IdleBlinker | undefined;
let lipSync: LipSync | undefined;
let audioContext: AudioContext | undefined;


class IdleBlinker {
    meshes: THREE.SkinnedMesh[];
    nextBlinkTime: number;
    isBlinking: boolean;

    constructor(meshes: THREE.SkinnedMesh[]) {
        this.meshes = meshes;
        this.nextBlinkTime = 0;
        this.isBlinking = false;
        this.setNextBlink();
    }
    setNextBlink() {
        const nextBlinkDelay = 2000 + Math.random() * 6000;
        this.nextBlinkTime = performance.now() + nextBlinkDelay;
    }
    update(time: number) {
        if (this.meshes.length === 0 || this.isBlinking || lipSync?.isTalking() || time < this.nextBlinkTime) {
            return;
        }
        this.isBlinking = true;
        this.triggerBlink();
    }
    triggerBlink() {
        const blinkDuration = 150;
        const startTime = performance.now();
        const dictionary = this.meshes[0].morphTargetDictionary;
        const blinkIndex = dictionary ? dictionary['Fcl_EYE_Close'] : undefined;

        if (blinkIndex === undefined) {
            console.error("Could not find 'Fcl_EYE_Close' for blinking.");
            this.isBlinking = false;
            return;
        }
        interface DoBlinkFunction {
            (currentTime: number): void;
        }

        const doBlink: DoBlinkFunction = (currentTime: number) => {
            const elapsedTime: number = currentTime - startTime;
            let value: number = (elapsedTime < blinkDuration / 2)
                ? (elapsedTime / (blinkDuration / 2))
                : 1.0 - ((elapsedTime - (blinkDuration / 2)) / (blinkDuration / 2));
            if (elapsedTime >= blinkDuration) {
                this.meshes.forEach((mesh: THREE.SkinnedMesh) => {
                    if (mesh.morphTargetInfluences) {
                        mesh.morphTargetInfluences[blinkIndex] = 0;
                    }
                });
                this.isBlinking = false;
                this.setNextBlink();
                return;
            }
            this.meshes.forEach((mesh: THREE.SkinnedMesh) => {
                if (mesh.morphTargetInfluences) {
                    mesh.morphTargetInfluences[blinkIndex] = value;
                }
            });
            requestAnimationFrame(doBlink);
        };
        requestAnimationFrame(doBlink);
    }
}

class LipSync {
    meshes: THREE.SkinnedMesh[];
    mouthShapes: string[];
    lastShape: string | null;
    intervalId: NodeJS.Timeout | null;

    constructor(meshes: THREE.SkinnedMesh[]) {
        this.meshes = meshes;
        this.mouthShapes = ["Fcl_MTH_A", "Fcl_MTH_I", "Fcl_MTH_U", "Fcl_MTH_E", "Fcl_MTH_O"];
        this.lastShape = null;
        this.intervalId = null;
    }
    isTalking() { return this.intervalId !== null; }
    start() {
        if (this.isTalking()) this.stop();
        this.intervalId = setInterval(() => {
            if (this.meshes.length === 0) return;
            const dictionary = this.meshes[0].morphTargetDictionary;
            if (this.lastShape && dictionary) {
                const lastIndex = dictionary[this.lastShape];
                if (lastIndex !== undefined) this.meshes.forEach(mesh => {
                    if (mesh.morphTargetInfluences) {
                        mesh.morphTargetInfluences[lastIndex] = 0;
                    }
                });
            }
            let newShape: string | null = this.lastShape;
            while (newShape === this.lastShape) {
                newShape = this.mouthShapes[Math.floor(Math.random() * this.mouthShapes.length)];
            }
            if (newShape !== null) {
                let newIndex: number | undefined = undefined;
                if (dictionary) {
                    newIndex = dictionary[newShape];
                }
                if (newIndex !== undefined) {
                    const value = 0.6 + 0.4 * Math.random();
                    this.meshes.forEach(mesh => {
                        if (mesh.morphTargetInfluences) {
                            mesh.morphTargetInfluences[newIndex] = value;
                        }
                    });
                }
                this.lastShape = newShape;
            }
        }, 120);
    }
    stop() {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
        }
        this.intervalId = null;
        if (this.meshes.length === 0) return;
        const dictionary = this.meshes[0].morphTargetDictionary;
        if (dictionary) {
            this.mouthShapes.forEach(shape => {
                const index = dictionary[shape];
                if (index !== undefined) this.meshes.forEach(mesh => {
                    if (mesh.morphTargetInfluences) {
                        mesh.morphTargetInfluences[index] = 0;
                    }
                });
            });
        }
        this.lastShape = null;
    }
}

const RETARGET_OPTIONS = {
    hip: 'J_Bip_C_Hips',
    useFirstFrameAsRest: false,
    names: {
        'J_Bip_C_Hips': 'Hips',
        'J_Bip_C_Spine': 'Spine',
        'J_Bip_C_Chest': 'Spine1',
        'J_Bip_C_UpperChest': 'Spine2',
        'J_Bip_C_Neck': 'Neck',
        'J_Bip_C_Head': 'Head',
        'J_Bip_L_Shoulder': 'LeftShoulder',
        'J_Bip_L_UpperArm': 'LeftArm',
        'J_Bip_L_LowerArm': 'LeftForeArm',
        'J_Bip_L_Hand': 'LeftHand',
        'J_Bip_R_Shoulder': 'RightShoulder',
        'J_Bip_R_UpperArm': 'RightArm',
        'J_Bip_R_LowerArm': 'RightForeArm',
        'J_Bip_R_Hand': 'RightHand',
        'J_Bip_L_UpperLeg': 'LeftUpLeg',
        'J_Bip_L_LowerLeg': 'LeftLeg',
        'J_Bip_L_Foot': 'LeftFoot',
        'J_Bip_L_ToeBase': 'LeftToe',
        'J_Bip_R_UpperLeg': 'RightUpLeg',
        'J_Bip_R_LowerLeg': 'RightLeg',
        'J_Bip_R_Foot': 'RightFoot',
        'J_Bip_R_ToeBase': 'RightToe',
        'J_Adj_L_FaceEye': 'left_eye_bone_name',  
        'J_Adj_R_FaceEye': 'right_eye_bone_name', 
    }
};


const BACKEND_URL = 'http://localhost:9093';

// --- Global variables ---
let scene: THREE.Scene;
let renderer: THREE.WebGLRenderer;
let camera: THREE.PerspectiveCamera;
let stats: Stats;
let controls: OrbitControls;
let mixer: THREE.AnimationMixer | undefined;
let currentModel: THREE.Group | undefined;
let idleAction: THREE.AnimationAction | undefined;
let idleClipData: THREE.AnimationClip | undefined;
let standingAction: THREE.AnimationAction | undefined;
let standingClipData: THREE.AnimationClip | undefined;
let standingTimeout: NodeJS.Timeout | undefined;
let lastGeneratedFiles: string[] = [];
let originalCameraPosition: THREE.Vector3;
let originalCameraTarget: THREE.Vector3;
let originalModelScale: number;
const clock = new THREE.Clock();

// --- DOM Elements ---
const characterGrid = document.getElementById('character-grid')!;
const characterNameEl = document.getElementById('character-name')!;
const characterSubtitleEl = document.getElementById('character-subtitle')!;
const characterInput = document.getElementById('character-input') as HTMLInputElement;
const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
const loadingOverlay = document.getElementById('loading-overlay')!;
const debugBtn = document.getElementById('debug-btn') as HTMLButtonElement;


// --- Initialization and Core Functions ---

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050a14);
    scene.fog = new THREE.Fog(0x050a14, 10, 50);
    camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
    
    camera.position.set(0, 5, 8);
    
    originalCameraPosition = camera.position.clone();
    originalCameraTarget = new THREE.Vector3(0, 1, 0);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 3);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 3);
    dirLight.position.set(3, 10, 10);
    scene.add(dirLight);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.update();

    stats = new Stats();
    document.body.appendChild(stats.dom);

    window.addEventListener('resize', onWindowResize);
    generateBtn.addEventListener('click', handleGenerateClick);
    debugBtn.addEventListener('click', () => rerun());
}

function createCharacterGrid() {
    characters.forEach((char, index) => {
        const card = document.createElement('div');
        card.className = 'character-card';
        card.style.backgroundImage = `url(${char.portraitPath})`;
        card.dataset.index = index.toString();
        const nameEl = document.createElement('div');
        nameEl.className = 'card-name';
        nameEl.innerText = char.name;
        card.appendChild(nameEl);
        card.addEventListener('click', () => selectCharacter(index));
        characterGrid.appendChild(card);
    });
}

async function selectCharacter(index: number) {
    const character = characters[index];
    if (!character) return;
    document.querySelectorAll('.character-card').forEach(card => card.classList.remove('active'));
    const cardElement = characterGrid.querySelector(`[data-index="${index}"]`);
    cardElement?.classList.add('active');
    characterNameEl.textContent = character.name;
    characterSubtitleEl.textContent = character.subtitle;
    await loadCharacterModel(character);
}

async function loadCharacterModel(character: CharacterData) {
    if (currentModel) {
        if ((currentModel as any).animationCycleInterval) {
            clearInterval((currentModel as any).animationCycleInterval);
            (currentModel as any).animationCycleInterval = null;
        }
        scene.remove(currentModel);
    }
    if (mixer) mixer.stopAllAction();
    if (standingTimeout) clearTimeout(standingTimeout);
    mixer = undefined;
    idleAction = undefined;
    idleClipData = undefined;
    standingAction = undefined;
    standingClipData = undefined;
    vrmMeshes = [];
    idleBlinker = undefined;
    lipSync = undefined;

    const gltfLoader = new GLTFLoader();
    const bvhLoader = new BVHLoader();
    const [targetGltf, idleBvh, standingBvh] = await Promise.all([
        gltfLoader.loadAsync(character.gltfPath),
        bvhLoader.loadAsync(character.idleAnimationPath),
        bvhLoader.loadAsync('standing.bvh'),
    ]);
    
    const modelContainer = new THREE.Group();
    modelContainer.add(targetGltf.scene);
    if (character.rotation) {
        modelContainer.rotation.set(...character.rotation);
    }
    
    currentModel = modelContainer;
    currentModel.scale.setScalar(character.scale);
    currentModel.position.set(0, 0, 0);
    currentModel.frustumCulled = false;
    scene.add(currentModel);
    
    currentModel.traverse(object => {
        if (object instanceof THREE.SkinnedMesh && object.morphTargetInfluences) {
            vrmMeshes.push(object);
        }
    });

    if (vrmMeshes.length > 0) {
        idleBlinker = new IdleBlinker(vrmMeshes);
        lipSync = new LipSync(vrmMeshes);
    }
    
    originalModelScale = character.scale;

    const targetSkinnedMesh = currentModel.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
    if (!targetSkinnedMesh) {
        console.error("Model does not contain a SkinnedMesh.");
        return;
    }
    mixer = new THREE.AnimationMixer(targetSkinnedMesh);

    standingClipData = SkeletonUtils.retargetClip(targetSkinnedMesh, standingBvh.skeleton, standingBvh.clip, RETARGET_OPTIONS);
    idleClipData = SkeletonUtils.retargetClip(targetSkinnedMesh, idleBvh.skeleton, idleBvh.clip, RETARGET_OPTIONS);

    if (standingClipData && idleClipData) {
        standingAction = mixer.clipAction(standingClipData).setLoop(THREE.LoopRepeat, Infinity);
        idleAction = mixer.clipAction(idleClipData).setLoop(THREE.LoopRepeat, Infinity);

        const playStanding = () => {
            if (!standingAction || !idleAction) return;
            const standDuration = 5000 + Math.random() * 5000;
            
            idleAction.fadeOut(0.5);
            standingAction.reset().fadeIn(0.5).play();
            
            if (standingTimeout) clearTimeout(standingTimeout);
            standingTimeout = setTimeout(playIdle, standDuration);
        };

        const playIdle = () => {
            if (!standingAction || !idleAction) return;
            const idleDuration = 4000 + Math.random() * 4000;

            standingAction.fadeOut(0.5);
            idleAction.reset().fadeIn(0.5).play();

            if (standingTimeout) clearTimeout(standingTimeout);
            standingTimeout = setTimeout(playStanding, idleDuration);
        };

        playStanding();

    } else {
        console.error("Failed to retarget one or more base animations.");
        if (standingClipData) {
            mixer.clipAction(standingClipData).setLoop(THREE.LoopRepeat, Infinity).play();
        } else if (idleClipData) {
            mixer.clipAction(idleClipData).setLoop(THREE.LoopRepeat, Infinity).play();
        }
    }
    
    console.log(`%c--- GLB Bones for ${character.name} ---`, 'color: #28a745; font-weight: bold;');
    console.log(targetSkinnedMesh.skeleton.bones.map(bone => bone.name));
    console.log('%c--- BVH Bones (from idle BVH) ---', 'color: #007bff; font-weight: bold;');
    console.log(idleBvh.skeleton.bones.map(bone => bone.name));

    const headBone = currentModel.getObjectByName('J_Bip_C_Head') as THREE.Bone;
    if (headBone) {
        headBone.rotation.x = -0.2;
    }
}

// --- NEW: Function to get or create the AudioContext ---
function getAudioContext(): AudioContext {
    if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContext;
}

// --- NEW: Function to play audio and manage lip-sync ---
async function playAudioWithLipSync(base64: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
        if (!lipSync) {
            resolve(); // Resolve immediately if no lipsync available
            return;
        }
        try {
            // Decode the Base64 string into binary data
            const audioData = atob(base64);
            const arrayBuffer = new ArrayBuffer(audioData.length);
            const uint8Array = new Uint8Array(arrayBuffer);
            for (let i = 0; i < audioData.length; i++) {
                uint8Array[i] = audioData.charCodeAt(i);
            }

            const context = getAudioContext();
            const audioBuffer = await context.decodeAudioData(arrayBuffer);
            
            const source = context.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(context.destination);

            lipSync.start();
            source.start(0);

            source.onended = () => {
                lipSync?.stop();
                resolve(); // Resolve the promise when audio finishes
            };

        } catch (error) {
            console.error("Failed to play audio:", error);
            lipSync?.stop(); // Ensure lipsync stops on error
            reject(error); // Reject the promise
        }
    });
}


async function handleGenerateClick() {
    const prompt = characterInput.value.trim();
    if (!prompt || !currentModel) {
        alert("Please enter a prompt.");
        return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';
    loadingOverlay.classList.add('visible');

    try {
        // --- Step 1: Get TTS Audio and Emotion ---
        const askResponse = await fetch(`${BACKEND_URL}/api/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: prompt }),
        });
        if (!askResponse.ok) throw new Error('Failed to get TTS response from backend.');
        
        const askResult = await askResponse.json();
        const audioBase64 = askResult.audio_base64;

        // --- Step 2: Play Audio with Lip-Sync ---
        if (audioBase64) {
            await playAudioWithLipSync(audioBase64);
        }

        // --- Step 3: Generate and Play Body Animation ---
        const bvhResponse = await fetch(`${BACKEND_URL}/api/generate_bvh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompts: [prompt] }),
        });
        if (!bvhResponse.ok) throw new Error((await bvhResponse.json()).detail || 'Failed to generate body animation.');
        
        const bvhResult = await bvhResponse.json();
        const generatedFiles: string[] = bvhResult.files_created;
        
        if (generatedFiles && generatedFiles.length > 0) {
            lastGeneratedFiles = generatedFiles;
            await playGeneratedSequence(generatedFiles);
        } else {
            console.warn("Generation successful, but no BVH files were returned.");
            await returnToStanding();
        }
    } catch (error) {
        console.error("Error during generation process:", error);
        alert(`An error occurred: ${error instanceof Error ? error.message : String(error)}`);
        await returnToStanding();
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate';
        // Loading overlay is handled by the animation functions
    }
}

async function returnToStanding() {
    if (!mixer || !currentModel || !standingClipData) return;

    const targetSkinnedMesh = currentModel.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
    if (!targetSkinnedMesh) return;

    if (standingTimeout) clearTimeout(standingTimeout);
    if ((currentModel as any).animationCycleInterval) {
        clearInterval((currentModel as any).animationCycleInterval);
        (currentModel as any).animationCycleInterval = null;
    }

    mixer.stopAllAction();
    targetSkinnedMesh.skeleton.pose();
    mixer = new THREE.AnimationMixer(targetSkinnedMesh);

    if (currentModel && originalModelScale) {
        currentModel.scale.setScalar(originalModelScale);
        currentModel.position.set(0, 0, 0);
    }
    camera.position.copy(originalCameraPosition);
    controls.target.copy(originalCameraTarget);
    controls.update();

    standingAction = mixer.clipAction(standingClipData);
    standingAction.setLoop(THREE.LoopRepeat, Infinity).play();
    loadingOverlay.classList.remove('visible');
}

async function playGeneratedSequence(filenames: string[]) {
    if (!mixer || !currentModel) {
        await returnToStanding();
        return;
    }

    const targetSkinnedMesh = currentModel.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
    if (!targetSkinnedMesh) {
        await returnToStanding();
        return;
    }

    loadingOverlay.classList.add('visible');

    if (standingTimeout) clearTimeout(standingTimeout);
    if ((currentModel as any).animationCycleInterval) {
        clearInterval((currentModel as any).animationCycleInterval);
        (currentModel as any).animationCycleInterval = null;
    }
    
    const enforceStates = () => {
        if (currentModel && originalModelScale) {
            currentModel.scale.setScalar(originalModelScale);
            currentModel.position.set(0, 0, 0);
            
            const targetSkinnedMesh = currentModel.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
            if (targetSkinnedMesh && targetSkinnedMesh.skeleton) {
                targetSkinnedMesh.skeleton.bones.forEach(bone => {
                    bone.scale.set(1, 1, 1);
                });
            }
        }
        camera.position.copy(originalCameraPosition);
        controls.target.copy(originalCameraTarget);
        controls.update();
    };
    enforceStates();

    mixer.stopAllAction();
    targetSkinnedMesh.skeleton.pose();
    mixer = new THREE.AnimationMixer(targetSkinnedMesh);

    const bvhLoader = new BVHLoader();
    let clips: BVH[];
    try {
        clips = await Promise.all(
            filenames.map(filename => bvhLoader.loadAsync(`${BACKEND_URL}/generated_bvh/${filename}`))
        );
    } catch (error) {
        console.error("Failed to load generated BVH files:", error);
        await returnToStanding();
        return;
    }

    const sequenceActions = clips.map(bvh => {
        const normalizedClip = normalizeAnimationHeight(bvh.clip);
        const retargetedClip = SkeletonUtils.retargetClip(targetSkinnedMesh, bvh.skeleton, normalizedClip, RETARGET_OPTIONS);
        const action = mixer!.clipAction(retargetedClip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        return action;
    });

    if (sequenceActions.length === 0 || sequenceActions.some(a => a.getClip().tracks.length === 0)) {
        console.error("Failed to retarget generated sequence. Returning to standing.");
        await returnToStanding();
        return;
    }
    
    let currentActionIndex = 0;
    const totalActions = sequenceActions.length;
    
    const stateEnforcementInterval = setInterval(enforceStates, 16);
    
    const onActionFinished = (event: any) => {
        if (event.action !== sequenceActions[currentActionIndex]) return;

        currentActionIndex++;
        
        if (currentActionIndex < totalActions) {
            const lastAction = sequenceActions[currentActionIndex - 1];
            const nextAction = sequenceActions[currentActionIndex];
            
            lastAction.crossFadeTo(nextAction, 0.3, true);
            nextAction.play();
        } else {
            mixer?.removeEventListener('finished', onActionFinished);
            clearInterval(stateEnforcementInterval);
            enforceStates();
            
            if (standingClipData && mixer) {
                const standingActionFinal = mixer.clipAction(standingClipData);
                standingActionFinal.setLoop(THREE.LoopRepeat, Infinity);
                
                const lastGeneratedAction = sequenceActions[totalActions - 1];
                lastGeneratedAction.crossFadeTo(standingActionFinal, 0.8, true);
                standingActionFinal.play();
                standingAction = standingActionFinal;

                standingTimeout = setTimeout(() => {
                    if (idleClipData && idleClipData.tracks.length > 0 && standingAction && mixer) {
                        idleAction = mixer.clipAction(idleClipData);
                        idleAction.setLoop(THREE.LoopRepeat, Infinity);
                        idleAction.play();
                        standingAction.crossFadeTo(idleAction, 0.5, false);
                    }
                }, 2500);
            }
            loadingOverlay.classList.remove('visible');
        }
    };
    
    sequenceActions[0].play();
    mixer.addEventListener('finished', onActionFinished);
    
    setTimeout(() => {
        loadingOverlay.classList.remove('visible');
    }, 100);
}

function normalizeAnimationHeight(clip: THREE.AnimationClip): THREE.AnimationClip {
    const normalizedClip = clip.clone();
    
    const yPositionTrack = normalizedClip.tracks.find(track => 
        track.name.includes('position') && track.name.includes('Hips')
    );
    
    if (yPositionTrack && yPositionTrack instanceof THREE.VectorKeyframeTrack) {
        const values = yPositionTrack.values;
        const yValues: number[] = [];
        for (let i = 1; i < values.length; i += 3) {
            yValues.push(values[i]);
        }
        
        const baselineY = 0.96;
        const avgY = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
        const offset = baselineY - avgY;
        
        for (let i = 1; i < values.length; i += 3) {
            values[i] += offset;
        }
        
        console.log(`Normalized animation height: avgY=${avgY.toFixed(3)}, offset=${offset.toFixed(3)}`);
    }
    
    return normalizedClip;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
 
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    if (idleBlinker) {
        idleBlinker.update(performance.now());
    }
    renderer.render(scene, camera);
    if (currentModel && originalModelScale) {
        currentModel.position.set(0, 0, 0);
        currentModel.scale.setScalar(originalModelScale);
        
        const targetSkinnedMesh = currentModel.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
        if (targetSkinnedMesh && targetSkinnedMesh.skeleton) {
            targetSkinnedMesh.skeleton.bones.forEach(bone => {
                bone.scale.set(1, 1, 1);
            });
        }
    }
    
    if (originalCameraPosition && originalCameraTarget && !controls.enabled) {
        camera.position.copy(originalCameraPosition);
        controls.target.copy(originalCameraTarget);
    }
    
    controls.update();
    renderer.render(scene, camera);
    stats.update();
}

async function rerun(filenames?: string[]) {
    const filesToRerun = filenames || lastGeneratedFiles;
    
    if (!filesToRerun || filesToRerun.length === 0) {
        alert("No previous animation to rerun. Please generate an animation first.");
        return;
    }
    
    console.log("Rerunning animation with files:", filesToRerun);
    
    debugBtn.disabled = true;
    debugBtn.textContent = 'Rerunning...';
    loadingOverlay.classList.add('visible');
    
    try {
        if (standingTimeout) clearTimeout(standingTimeout);
        if (currentModel && (currentModel as any).animationCycleInterval) {
            clearInterval((currentModel as any).animationCycleInterval);
            (currentModel as any).animationCycleInterval = null;
        }
        
        await playGeneratedSequence(filesToRerun);
    } catch (error) {
        console.error("Error during rerun:", error);
        await returnToStanding();
    } finally {
        debugBtn.disabled = false;
        debugBtn.textContent = 'Rerun Last';
    }
}

async function main() {
    init();
    createCharacterGrid();
    await selectCharacter(0);
    animate();
}

main();

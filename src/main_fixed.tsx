import './style.css';
import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BVHLoader } from 'three/addons/loaders/BVHLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// --- Interfaces ---
interface CharacterData {
    name: string;
    subtitle: string;
    gltfPath: string;
    portraitPath: string;
    scale: number;
    idleAnimationPath: string;
    talkAnimationPath: string;
    rotation?: [number, number, number];
}

// A mock for VRMExpressionPresetName to avoid dependency issues
const VRMExpressionPresetName = {
    A: "a", I: "i", U: "u", E: "e", O: "o",
    Blink: "blink", Joy: "joy", Angry: "angry", Sorrow: "sorrow", Fun: "fun",
    LookUp: "lookup", LookDown: "lookdown", LookLeft: "lookleft", LookRight: "lookright",
    Neutral: "neutral",
} as const;


// --- Constants & Configuration ---
const characters: CharacterData[] = [
    {
        name: 'Winter',
        subtitle: 'Waifu',
        gltfPath: 'bestwaifu.glb',
        portraitPath: 'Remy.png',
        scale: 2.5,
        idleAnimationPath: 'Helloidle.bvh',
        talkAnimationPath: 'walking.bvh', // Note: using walking as a placeholder for talking
        rotation: [0, 0, 0],
    }
];

const RETARGET_OPTIONS = {
    hip: 'J_Bip_C_Hips',
    useFirstFrameAsRest: false,
    names: {
        'J_Bip_C_Hips': 'Hips', 'J_Bip_C_Spine': 'Spine', 'J_Bip_C_Chest': 'Spine1',
        'J_Bip_C_UpperChest': 'Spine2', 'J_Bip_C_Neck': 'Neck', 'J_Bip_C_Head': 'Head',
        'J_Bip_L_Shoulder': 'LeftShoulder', 'J_Bip_L_UpperArm': 'LeftArm', 'J_Bip_L_LowerArm': 'LeftForeArm',
        'J_Bip_L_Hand': 'LeftHand', 'J_Bip_R_Shoulder': 'RightShoulder', 'J_Bip_R_UpperArm': 'RightArm',
        'J_Bip_R_LowerArm': 'RightForeArm', 'J_Bip_R_Hand': 'RightHand', 'J_Bip_L_UpperLeg': 'LeftUpLeg',
        'J_Bip_L_LowerLeg': 'LeftLeg', 'J_Bip_L_Foot': 'LeftFoot', 'J_Bip_L_ToeBase': 'LeftToe',
        'J_Bip_R_UpperLeg': 'RightUpLeg', 'J_Bip_R_LowerLeg': 'RightLeg', 'J_Bip_R_Foot': 'RightFoot',
        'J_Bip_R_ToeBase': 'RightToe',
    }
};

const BACKEND_URL = 'http://localhost:9093';

// --- Global State ---
let scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera;
let stats: Stats, controls: OrbitControls;
let mixer: THREE.AnimationMixer | undefined;
let currentModel: THREE.Group | undefined;
let vrmMeshes: THREE.SkinnedMesh[] = [];
let animationTimeout: NodeJS.Timeout | null = null;

// Animation Actions
let idleAction: THREE.AnimationAction | undefined, standingAction: THREE.AnimationAction | undefined, talkAction: THREE.AnimationAction | undefined;

// Controllers
let idleBlinker: IdleBlinker | undefined, lipSync: LipSync | undefined, gazeController: GazeController | undefined;

// --- DOM Elements ---
const characterGrid = document.getElementById('character-grid')!;
const characterNameEl = document.getElementById('character-name')!;
const characterSubtitleEl = document.getElementById('character-subtitle')!;
const characterInput = document.getElementById('character-input') as HTMLInputElement;
const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
const loadingOverlay = document.getElementById('loading-overlay')!;
const clock = new THREE.Clock();

// --- Core Classes ---

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
            this.isBlinking = false;
            return;
        }
        const doBlink = (currentTime: number) => {
            const elapsedTime = currentTime - startTime;
            let value = (elapsedTime < blinkDuration / 2)
                ? (elapsedTime / (blinkDuration / 2))
                : 1.0 - ((elapsedTime - (blinkDuration / 2)) / (blinkDuration / 2));
            if (elapsedTime >= blinkDuration) {
                this.meshes.forEach(mesh => {
                    if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[blinkIndex] = 0;
                });
                this.isBlinking = false;
                this.setNextBlink();
                return;
            }
            this.meshes.forEach(mesh => {
                if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[blinkIndex] = value;
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
    audioContext: AudioContext;
    sourceNode: AudioBufferSourceNode | undefined;

    constructor(meshes: THREE.SkinnedMesh[]) {
        this.meshes = meshes;
        this.mouthShapes = ["Fcl_MTH_A", "Fcl_MTH_I", "Fcl_MTH_U", "Fcl_MTH_E", "Fcl_MTH_O"];
        this.lastShape = null;
        this.intervalId = null;
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    isTalking() { return this.intervalId !== null; }

    async play(sentence: string) {
        try {
            const response = await fetch(`${BACKEND_URL}/api/synthesize_speech?text=${encodeURIComponent(sentence)}`);
            if (!response.ok) throw new Error(`Speech synthesis failed: ${response.statusText}`);
            const audioData = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(audioData);

            this.sourceNode = this.audioContext.createBufferSource();
            this.sourceNode.buffer = audioBuffer;
            this.sourceNode.connect(this.audioContext.destination);
            
            this.start();
            this.sourceNode.start();

            return new Promise<void>(resolve => {
                this.sourceNode!.onended = () => {
                    this.stop();
                    resolve();
                };
            });
        } catch (error) {
            console.error("Error playing audio:", error);
            this.stop();
        }
    }

    start() {
        if (this.isTalking()) this.stop();
        this.intervalId = setInterval(() => {
            if (this.meshes.length === 0) return;
            const dictionary = this.meshes[0].morphTargetDictionary;
            if (!dictionary) return;

            if (this.lastShape) {
                const lastIndex = dictionary[this.lastShape];
                if (lastIndex !== undefined) this.meshes.forEach(mesh => {
                    if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[lastIndex] = 0;
                });
            }

            let newShape = this.lastShape;
            while (newShape === this.lastShape) {
                newShape = this.mouthShapes[Math.floor(Math.random() * this.mouthShapes.length)];
            }
            
            const newIndex = dictionary[newShape];
            if (newIndex !== undefined) {
                const value = 0.6 + 0.4 * Math.random();
                this.meshes.forEach(mesh => {
                    if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[newIndex] = value;
                });
            }
            this.lastShape = newShape;
        }, 120);
    }

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = null;
        if (this.meshes.length === 0) return;
        const dictionary = this.meshes[0].morphTargetDictionary;
        if (dictionary) {
            this.mouthShapes.forEach(shape => {
                const index = dictionary[shape];
                if (index !== undefined) this.meshes.forEach(mesh => {
                    if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = 0;
                });
            });
        }
        this.lastShape = null;
    }
}

class GazeController {
    camera: THREE.PerspectiveCamera;
    leftEye: THREE.Bone | undefined;
    rightEye: THREE.Bone | undefined;
    mouse: THREE.Vector2;
    raycaster: THREE.Raycaster;
    target: THREE.Vector3;
    initialized: boolean;
    plane: THREE.Plane;
    worldPosition: THREE.Vector3;

    constructor(camera: THREE.PerspectiveCamera) {
        this.camera = camera;
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.target = new THREE.Vector3();
        this.initialized = false;
        this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
        this.worldPosition = new THREE.Vector3();
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
    }

    onMouseMove(event: MouseEvent) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    setEyes(model: THREE.Group) {
        this.leftEye = model.getObjectByName('J_Adj_L_FaceEye') as THREE.Bone;
        this.rightEye = model.getObjectByName('J_Adj_R_FaceEye') as THREE.Bone;

        if (this.leftEye && this.rightEye) {
            this.initialized = true;
            const head = this.leftEye.parent;
            if (head) {
                head.getWorldPosition(this.worldPosition);
                this.plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), this.worldPosition);
            }
        } else {
            console.warn("Could not find eye bones for GazeController.");
        }
    }

    update() {
        if (!this.initialized || !this.leftEye || !this.rightEye) return;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        this.raycaster.ray.intersectPlane(this.plane, this.target);

        if (this.target) {
            this.leftEye.lookAt(this.target);
            this.rightEye.lookAt(this.target);
        }
    }
}

// --- Initialization ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050a14);
    scene.fog = new THREE.Fog(0x050a14, 10, 50);
    camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.5, 8);

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

    gazeController = new GazeController(camera);

    window.addEventListener('resize', onWindowResize);
    generateBtn.addEventListener('click', handleGenerateClick);
}

// --- Character & Animation Management ---
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
    if (currentModel) scene.remove(currentModel);
    if (mixer) mixer.stopAllAction();
    if (animationTimeout) clearTimeout(animationTimeout);
    vrmMeshes = [];

    const gltfLoader = new GLTFLoader();
    const bvhLoader = new BVHLoader();
    const [targetGltf, idleBvh, standingBvh, talkBvh] = await Promise.all([
        gltfLoader.loadAsync(character.gltfPath),
        bvhLoader.loadAsync(character.idleAnimationPath),
        bvhLoader.loadAsync('standing.bvh'),
        bvhLoader.loadAsync(character.talkAnimationPath),
    ]);

    currentModel = targetGltf.scene;
    if (character.rotation) currentModel.rotation.set(...character.rotation);
    currentModel.scale.setScalar(character.scale);
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
    gazeController?.setEyes(currentModel);

    const targetSkinnedMesh = currentModel.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
    if (!targetSkinnedMesh) return;
    mixer = new THREE.AnimationMixer(targetSkinnedMesh);

    const standingClipData = SkeletonUtils.retargetClip(targetSkinnedMesh, standingBvh.skeleton, standingBvh.clip, RETARGET_OPTIONS);
    const idleClipData = SkeletonUtils.retargetClip(targetSkinnedMesh, idleBvh.skeleton, idleBvh.clip, RETARGET_OPTIONS);
    const talkClipData = SkeletonUtils.retargetClip(targetSkinnedMesh, talkBvh.skeleton, talkBvh.clip, RETARGET_OPTIONS);

    standingAction = mixer.clipAction(standingClipData);
    idleAction = mixer.clipAction(idleClipData);
    talkAction = mixer.clipAction(talkClipData);

    startIdleAnimationLoop();
}

function startIdleAnimationLoop() {
    if (animationTimeout) clearTimeout(animationTimeout);

    const playStanding = () => {
        if (!standingAction || !idleAction || talkAction?.isRunning()) {
            animationTimeout = setTimeout(playStanding, 1000);
            return;
        }
        const standingDuration = 5000 + Math.random() * 5000;
        idleAction?.fadeOut(0.5);
        standingAction.reset().fadeIn(0.5).play();
        animationTimeout = setTimeout(playIdle, standingDuration);
    };

    const playIdle = () => {
        if (!standingAction || !idleAction || talkAction?.isRunning()) {
            animationTimeout = setTimeout(playIdle, 1000);
            return;
        }
        const idleDuration = 4000 + Math.random() * 4000;
        standingAction?.fadeOut(0.5);
        idleAction.reset().fadeIn(0.5).play();
        animationTimeout = setTimeout(playStanding, idleDuration);
    };

    playStanding();
}

// --- Script Execution Logic ---
async function handleGenerateClick() {
    const prompt = characterInput.value.trim();
    if (!prompt || !currentModel) return;
    if (animationTimeout) clearTimeout(animationTimeout);

    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';
    loadingOverlay.classList.add('visible');

    try {
        const response = await fetch(`${BACKEND_URL}/api/create_script`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to create script.');
        }
        const result = await response.json();
        await executeScript(result.script);

    } catch (error) {
        console.error("Error during generation process:", error);
        alert(`An error occurred: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate';
        loadingOverlay.classList.remove('visible');
        startIdleAnimationLoop();
    }
}

async function executeScript(script: {type: string, value: string}[]) {
    for (const action of script) {
        switch (action.type) {
            case 'animation':
                await handleAnimationAction(action.value);
                break;
            case 'emotion':
                handleEmotionAction(action.value);
                break;
            case 'talk':
                await handleTalkAction(action.value);
                break;
        }
    }
}

async function handleAnimationAction(animationName: string) {
    if (!mixer) return;
    // Placeholder for handling custom animations by name
    console.log(`Playing animation: ${animationName}`);
    // In a real scenario, you would load and play the corresponding animation clip
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate animation duration
}

function handleEmotionAction(emotionName: string) {
    if (!vrmMeshes.length) return;
    const presetName = emotionName as keyof typeof VRMExpressionPresetName;
    vrmMeshes.forEach(mesh => {
        const morphTargetInfluences = mesh.morphTargetInfluences;
        const morphTargetDictionary = mesh.morphTargetDictionary;
        if (morphTargetInfluences && morphTargetDictionary) {
            // Reset all morph targets
            for (let i = 0; i < morphTargetInfluences.length; i++) {
                morphTargetInfluences[i] = 0;
            }
            // Apply the target emotion
            const morphIndex = morphTargetDictionary[presetName];
            if (morphIndex !== undefined) {
                morphTargetInfluences[morphIndex] = 1.0;
            }
        }
    });
}

async function handleTalkAction(sentence: string) {
    if (!lipSync || !talkAction) return;
    mixer?.stopAllAction();
    talkAction.reset().fadeIn(0.2).play();
    await lipSync.play(sentence);
    talkAction.fadeOut(0.2);
}

// --- Main ---
async function main() {
    init();
    createCharacterGrid();
    await selectCharacter(0);
    animate();
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

main();

// --- Render Loop & Utilities ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);
    if (idleBlinker) idleBlinker.update(performance.now());
    if (gazeController) gazeController.update();
    
    controls.update();
    renderer.render(scene, camera);
    stats.update();
}

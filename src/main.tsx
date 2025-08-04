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
        scale: 1.6,
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
        
        // Reapply current emotion after lip sync stops
        setTimeout(() => {
            applyEmotion(currentEmotion);
        }, 100);
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
const MISTRAL_BACKEND_URL = 'http://localhost:9094'; // For Mistral AI companion backend

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

// --- Emotion system ---
let currentEmotion = 'neutral';
const emotionMorphTargets: { [key: string]: { [key: string]: number } } = {
    'neutral': {},
    'happy': { 'Fcl_MTH_Smile': 0.8, 'Fcl_EYE_Smile_L': 0.6, 'Fcl_EYE_Smile_R': 0.6 },
    'angry': { 'Fcl_BRW_Angry': 0.7, 'Fcl_MTH_Serious': 0.5 },
    'sad': { 'Fcl_BRW_Sorrow': 0.8, 'Fcl_MTH_Down': 0.6 },
    'fear': { 'Fcl_EYE_Surprised': 0.8, 'Fcl_MTH_Small': 0.5 },
    'disgust': { 'Fcl_BRW_Angry': 0.5, 'Fcl_MTH_Serious': 0.7 },
    'love': { 'Fcl_MTH_Smile': 1.0, 'Fcl_EYE_Smile_L': 0.8, 'Fcl_EYE_Smile_R': 0.8, 'Fcl_EYE_Heart_L': 0.3, 'Fcl_EYE_Heart_R': 0.3 },
    'sleep': { 'Fcl_EYE_Close': 1.0, 'Fcl_MTH_Small': 0.3 },
    
    // === CLEAR & DISTINCTIVE EMOTIONS ===
    'pout': { 'Fcl_MTH_Down': 0.8, 'Fcl_BRW_Sorrow': 0.5, 'Fcl_MTH_Small': 0.7 },
    'smirk': { 'Fcl_MTH_Smile': 0.5, 'Fcl_EYE_Wink_L': 1.0 },
    'wink': { 'Fcl_EYE_Wink_R': 1.0, 'Fcl_MTH_Smile': 0.5 },
    'surprised': { 'Fcl_EYE_Surprised': 1.0, 'Fcl_MTH_O': 1.0 },
    'flirty': { 'Fcl_MTH_Smile': 0.7, 'Fcl_EYE_Wink_R': 1.0, 'Fcl_EYE_Heart_L': 0.4, 'Fcl_EYE_Heart_R': 0.4 },
    'shy': { 'Fcl_MTH_Small': 1.0, 'Fcl_EYE_Close': 0.6, 'Fcl_BRW_Sorrow': 0.3 },
    'excited': { 'Fcl_MTH_Smile': 1.0, 'Fcl_EYE_Surprised': 0.8, 'Fcl_EYE_Smile_L': 0.6, 'Fcl_EYE_Smile_R': 0.6 },
    'serious': { 'Fcl_MTH_Serious': 1.0, 'Fcl_BRW_Angry': 0.3 },
    'embarrassed': { 'Fcl_MTH_Down': 0.5, 'Fcl_EYE_Close': 0.8, 'Fcl_BRW_Sorrow': 0.6 },
    'content': { 'Fcl_MTH_Smile': 0.6, 'Fcl_EYE_Close': 0.4 },
    'dreamy': { 'Fcl_MTH_Smile': 0.4, 'Fcl_EYE_Heart_L': 0.8, 'Fcl_EYE_Heart_R': 0.8, 'Fcl_EYE_Close': 0.3 }
};

// --- DOM Elements ---
const characterGrid = document.getElementById('character-grid')!;
const characterNameEl = document.getElementById('character-name')!;
const characterSubtitleEl = document.getElementById('character-subtitle')!;
const characterInput = document.getElementById('character-input') as HTMLInputElement;
const generateBtn = document.getElementById('generate-btn') as HTMLDivElement;
const loadingOverlay = document.getElementById('loading-overlay')!;
const debugBtn = document.getElementById('debug-btn') as HTMLDivElement;
const testTtsBtn = document.getElementById('test-tts-btn') as HTMLDivElement;
const statusIndicator = document.getElementById('status-indicator')!;
const loadingValue = document.getElementById('loading-value')!;
const emotionButtons = document.querySelectorAll('.emotion-btn') as NodeListOf<HTMLDivElement>;

function updateStatus(message: string) {
    if (statusIndicator) {
        statusIndicator.textContent = message;
    }
    if (loadingValue) {
        loadingValue.textContent = message;
    }
    console.log(`📊 Status: ${message}`);
}

// --- Emotion Functions ---
function applyEmotion(emotion: string) {
    if (!vrmMeshes || vrmMeshes.length === 0) {
        console.warn('No VRM meshes available for emotion application');
        return;
    }

    // Reset all emotion morphs first
    vrmMeshes.forEach(mesh => {
        if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
            // Reset all emotion morphs (expanded list for new emotions)
            const emotionMorphs = [
                'Fcl_MTH_Smile', 'Fcl_MTH_Down', 'Fcl_MTH_Serious', 'Fcl_MTH_Small', 'Fcl_MTH_O',
                'Fcl_EYE_Smile_L', 'Fcl_EYE_Smile_R', 'Fcl_EYE_Surprised', 'Fcl_EYE_Close',
                'Fcl_EYE_Heart_L', 'Fcl_EYE_Heart_R', 'Fcl_EYE_Wink_L', 'Fcl_EYE_Wink_R',
                'Fcl_BRW_Angry', 'Fcl_BRW_Sorrow', 'Fcl_BRW_Up', 'Fcl_BRW_Down'
            ];
            
            emotionMorphs.forEach(morphName => {
                const index = mesh.morphTargetDictionary?.[morphName];
                if (index !== undefined && mesh.morphTargetInfluences) {
                    mesh.morphTargetInfluences[index] = 0;
                }
            });
        }
    });

    // Apply new emotion
    const emotionData = emotionMorphTargets[emotion];
    if (emotionData) {
        vrmMeshes.forEach(mesh => {
            if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
                Object.entries(emotionData).forEach(([morphName, value]) => {
                    const index = mesh.morphTargetDictionary?.[morphName];
                    if (index !== undefined && mesh.morphTargetInfluences) {
                        mesh.morphTargetInfluences[index] = value;
                    }
                });
            }
        });
    }

    currentEmotion = emotion;
    updateEmotionButtons();
    console.log(`Applied emotion: ${emotion}`);
}

// Helper function to log all available morph targets (for debugging)
function logAvailableMorphTargets() {
    if (vrmMeshes && vrmMeshes.length > 0 && vrmMeshes[0].morphTargetDictionary) {
        console.log('%c=== Available Morph Targets ===', 'color: #ff6b6b; font-weight: bold;');
        const dictionary = vrmMeshes[0].morphTargetDictionary;
        Object.keys(dictionary).sort().forEach(key => {
            console.log(`${key}: ${dictionary[key]}`);
        });
        console.log('%c================================', 'color: #ff6b6b; font-weight: bold;');
    }
}

// Helper function to test individual morph targets (call from browser console)
// Example: testMorphTarget('Fcl_MTH_Smile', 0.8)
(window as any).testMorphTarget = function(morphName: string, value: number = 1.0) {
    if (!vrmMeshes || vrmMeshes.length === 0) {
        console.warn('No VRM meshes available');
        return;
    }
    
    const mesh = vrmMeshes[0];
    if (!mesh.morphTargetDictionary) {
        console.warn('No morph target dictionary found');
        return;
    }
    
    const index = mesh.morphTargetDictionary[morphName];
    if (index === undefined) {
        console.warn(`Morph target '${morphName}' not found. Available targets:`, Object.keys(mesh.morphTargetDictionary));
        return;
    }
    
    // Reset all morphs first
    applyEmotion('neutral');
    
    // Apply the test morph
    vrmMeshes.forEach(mesh => {
        if (mesh.morphTargetInfluences) {
            mesh.morphTargetInfluences[index] = value;
        }
    });
    
    console.log(`Applied ${morphName} at value ${value}`);
};

// Helper function to create custom emotions (call from browser console)
// Example: createCustomEmotion('myEmotion', { 'Fcl_MTH_Smile': 0.5, 'Fcl_EYE_Wink_L': 1.0 })
(window as any).createCustomEmotion = function(name: string, morphs: { [key: string]: number }) {
    emotionMorphTargets[name] = morphs;
    console.log(`Created custom emotion '${name}':`, morphs);
    console.log(`Use applyEmotion('${name}') to test it`);
};

// Make applyEmotion available globally for testing
(window as any).applyEmotion = applyEmotion;

function updateEmotionButtons() {
    emotionButtons.forEach(button => {
        const emotion = button.dataset.emotion;
        if (emotion === currentEmotion) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

function setupEmotionControls() {
    emotionButtons.forEach(button => {
        button.addEventListener('click', () => {
            const emotion = button.dataset.emotion;
            if (emotion && !button.classList.contains('disabled')) {
                applyEmotion(emotion);
            }
        });
    });
    
    // Set default emotion
    applyEmotion('neutral');
}

async function testTTSDirectly() {
    // Check if button is disabled
    if (testTtsBtn.classList.contains('disabled')) {
        return;
    }
    
    const testText = "Hello, this is a direct TTS test. Can you hear me clearly?";
    
    testTtsBtn.classList.add('disabled');
    testTtsBtn.textContent = 'Testing...';
    updateStatus("Testing TTS directly...");
    
    try {
        console.log(`🧪 Testing TTS with: "${testText}"`);
        
        const askResponse = await fetch(`${BACKEND_URL}/api/ask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: testText }),
        });
        
        console.log(`🌐 Direct TTS Response Status: ${askResponse.status}`);
        
        if (askResponse.ok) {
            const askResult = await askResponse.json();
            console.log(`📋 Direct TTS Response:`, askResult);
            
            if (askResult.audio_base64) {
                updateStatus("Playing direct TTS test...");
                await playAudioWithLipSync(askResult.audio_base64);
                updateStatus("Direct TTS test completed!");
            } else {
                updateStatus("TTS response missing audio_base64");
                console.error("❌ No audio_base64 in TTS response");
            }
        } else {
            const errorText = await askResponse.text();
            updateStatus(`TTS failed: ${askResponse.status}`);
            console.error(`❌ Direct TTS failed: ${askResponse.status} - ${errorText}`);
        }
    } catch (error) {
        updateStatus(`TTS error: ${error}`);
        console.error("❌ Direct TTS error:", error);
    } finally {
        testTtsBtn.classList.remove('disabled');
        testTtsBtn.textContent = 'Test TTS';
        
        setTimeout(() => {
            updateStatus("Ready");
        }, 3000);
    }
}


// --- Initialization and Core Functions ---

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);
    scene.fog = new THREE.Fog(0x202020, 10, 50);
    camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
    
    camera.position.set(0, 1.2, 2.5); // Centered, slightly higher, farther back for better framing
    
    originalCameraPosition = camera.position.clone();
    originalCameraTarget = new THREE.Vector3(0, 2.5, 0); // Look at slightly higher point

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 3);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 3);
    dirLight.position.set(3, 10, 10);
    scene.add(dirLight);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // Append canvas to the avatar container instead of body
    const avatarContainer = document.getElementById('avatar');
    if (avatarContainer) {
        avatarContainer.appendChild(renderer.domElement);
        // Set initial size based on container
        const rect = avatarContainer.getBoundingClientRect();
        renderer.setSize(rect.width, rect.height);
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
    } else {
        document.body.appendChild(renderer.domElement);
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.2, 0); // Match the camera target height
    controls.update();
    
    // Configure zoom sensitivity and limits
    controls.enableZoom = true;
    controls.zoomSpeed = 0.2; // Slightly faster zoom speed for better UX
    controls.minDistance = 2; // Allow closer zoom
    controls.maxDistance = 5; // Allow farther zoom
    controls.enableDamping = true; // Add smooth damping
    controls.dampingFactor = 0.05; // Damping factor for smoothness

    stats = new Stats();
    // Append stats to avatar container with better positioning and smaller size
    if (avatarContainer) {
        stats.dom.style.position = 'absolute';
        stats.dom.style.top = '5px';
        stats.dom.style.left = '5px';
        stats.dom.style.zIndex = '100';
        stats.dom.style.transform = 'scale(0.7)';
        stats.dom.style.transformOrigin = 'top left';
        avatarContainer.appendChild(stats.dom);
    } else {
        document.body.appendChild(stats.dom);
    }

    window.addEventListener('resize', onWindowResize);
    generateBtn.addEventListener('click', handleGenerateClick);
    debugBtn.addEventListener('click', () => rerun());
    testTtsBtn.addEventListener('click', testTTSDirectly);
    setupEmotionControls();
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
    currentModel.position.set(0, -0.5, 0);
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
        
        // Log available morph targets for debugging
        logAvailableMorphTargets();
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

// --- Function to play audio and manage lip-sync ---
async function playAudioWithLipSync(base64: string): Promise<void> {
    return new Promise(async (resolve) => {
        if (!base64) {
            console.warn('No audio data provided');
            updateStatus("No audio data");
            resolve();
            return;
        }

        if (!lipSync) {
            console.warn('No lip sync available - lipSync object not found');
            updateStatus("No lip sync available");
            resolve();
            return;
        }

        try {
            console.log('🔊 Starting audio playback with lip sync...');
            updateStatus("Starting audio & lip sync...");
            
            // Decode the Base64 string into binary data
            const audioData = atob(base64);
            const arrayBuffer = new ArrayBuffer(audioData.length);
            const uint8Array = new Uint8Array(arrayBuffer);
            for (let i = 0; i < audioData.length; i++) {
                uint8Array[i] = audioData.charCodeAt(i);
            }

            const context = getAudioContext();
            
            // Resume audio context if it's suspended (required by browser policies)
            if (context.state === 'suspended') {
                console.log('Resuming audio context...');
                updateStatus("Resuming audio context...");
                await context.resume();
            }
            
            console.log('Decoding audio data...');
            updateStatus("Decoding audio...");
            const audioBuffer = await context.decodeAudioData(arrayBuffer);
            console.log(`Audio decoded: ${audioBuffer.duration.toFixed(2)}s duration`);
            
            const source = context.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(context.destination);

            // Start lip sync before playing audio
            console.log('👄 Starting lip sync...');
            updateStatus(`Playing audio (${audioBuffer.duration.toFixed(1)}s) + lip sync...`);
            lipSync.start();
            
            // Set up event handlers
            source.onended = () => {
                console.log('🔇 Audio playback finished, stopping lip sync');
                updateStatus("Audio finished, stopping lip sync");
                lipSync?.stop();
                resolve();
            };

            // Start audio playback
            console.log('▶️ Starting audio playback...');
            source.start(0);

        } catch (error) {
            console.error("❌ Failed to play audio:", error);
            updateStatus(`Audio error: ${error}`);
            lipSync?.stop();
            // Don't reject for audio errors, just resolve to continue
            resolve();
        }
    });
}


async function handleGenerateClick() {
    // Check if button is disabled
    if (generateBtn.classList.contains('disabled')) {
        return;
    }
    
    const prompt = characterInput.value.trim();
    if (!prompt || !currentModel) {
        alert("Please enter a prompt.");
        return;
    }

    generateBtn.classList.add('disabled');
    generateBtn.textContent = 'Generating...';
    updateStatus("Starting generation...");
    // Remove loading overlay to see what's happening
    // loadingOverlay.classList.add('visible');

    try {
        console.log(`Starting generation process for: "${prompt}"`);
        
        // --- Step 1: Get AI Companion Response from Mistral backend ---
        updateStatus("Asking companion AI...");
        console.log("Fetching companion response...");
        const companionResponse = await fetch(`${MISTRAL_BACKEND_URL}/api/companion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: prompt }),
        });
        
        if (!companionResponse.ok) {
            const errorText = await companionResponse.text();
            console.error(`Companion API failed: ${companionResponse.status} - ${errorText}`);
            throw new Error(`Companion API failed with status: ${companionResponse.status}`);
        }
        
        const companionResult = await companionResponse.json();
        const { action, keywords, response: answer } = companionResult;
        console.log(`✅ Companion Response:`, { answer, action, keywords });

        // Validate the response
        if (!answer || typeof answer !== 'string') {
            console.error('Invalid companion response - no answer provided');
            throw new Error('Invalid response from companion');
        }

        // --- Step 2: Get TTS Audio for the response ---
        updateStatus("Getting speech audio...");
        console.log("Fetching TTS audio...");
        console.log(`📝 Text to convert to speech: "${answer}"`);
        let audioBase64: string | null = null;
        try {
            const askResponse = await fetch(`${BACKEND_URL}/api/ask`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: answer }),
            });
            
            console.log(`🌐 TTS API Response Status: ${askResponse.status}`);
            
            if (askResponse.ok) {
                const askResult = await askResponse.json();
                console.log(`📋 TTS API Response:`, askResult);
                audioBase64 = askResult.audio_base64;
                
                if (audioBase64) {
                    console.log("✅ TTS audio received successfully");
                    console.log(`📏 Audio data length: ${audioBase64.length} characters`);
                } else {
                    console.warn("⚠️ TTS response OK but no audio_base64 field");
                }
            } else {
                const errorText = await askResponse.text();
                console.warn(`❌ TTS failed with status: ${askResponse.status}`);
                console.warn(`📄 TTS error response: ${errorText}`);
            }
        } catch (error) {
            console.warn('❌ TTS error:', error);
            // Continue without audio
        }

        // --- Step 3: Execute based on action type ---
        console.log(`Executing action: ${action}`);
        
        if (action === 'talking') {
            // For talking: play audio with lip sync only (no animation for now)
            updateStatus("Playing speech with lip sync...");
            console.log("Playing talking with audio and lip sync");
            
            if (audioBase64) {
                console.log("Starting lip sync with audio...");
                await playAudioWithLipSync(audioBase64);
                console.log("Lip sync completed");
            } else {
                console.log("No audio to play, just waiting a moment...");
                updateStatus("No audio available, waiting...");
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

        } else if (action === 'generate' && keywords && keywords.length > 0) {
            // For generate: play audio first, then generate and play animation
            updateStatus(`Generating animation from: ${keywords.join(', ')}`);
            console.log("Generating animation from keywords:", keywords);
            
            // Play audio first while generating motion
            if (audioBase64) {
                console.log("Playing audio with lip sync...");
                updateStatus("Playing speech with lip sync...");
                await playAudioWithLipSync(audioBase64);
            }
            
            // Now generate motion animation
            try {
                updateStatus("Generating motion animation...");
                console.log("Generating BVH animation from keywords:", keywords);
                
                const bvhResponse = await fetch(`${BACKEND_URL}/api/generate_bvh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompts: keywords }),
                });
                
                if (!bvhResponse.ok) {
                    const errorText = await bvhResponse.text();
                    console.error(`Motion generation failed: ${bvhResponse.status} - ${errorText}`);
                    throw new Error('Failed to generate motion animation');
                }
                
                const bvhResult = await bvhResponse.json();
                const generatedFiles: string[] = bvhResult.files_created || [];
                
                console.log("Generated BVH files:", generatedFiles);
                
                if (generatedFiles && generatedFiles.length > 0) {
                    updateStatus("Playing generated animation...");
                    lastGeneratedFiles = generatedFiles;
                    await playGeneratedSequence(generatedFiles);
                    console.log("Animation sequence completed");
                } else {
                    console.warn("Motion generation successful, but no BVH files were returned");
                    updateStatus("No animation files generated");
                }
                
            } catch (motionError) {
                console.error("Motion generation error:", motionError);
                updateStatus("Motion generation failed, returning to idle");
                // Don't throw here, just continue without animation
            }
            
        } else {
            // Fallback: just play audio
            updateStatus("Fallback: Playing audio only");
            console.log("Fallback action - playing audio only");
            if (audioBase64) {
                await playAudioWithLipSync(audioBase64);
            } else {
                console.log("No audio to play");
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        updateStatus("Completed successfully!");
        console.log("✅ Generation process completed successfully");

    } catch (error) {
        console.error("❌ Error during generation process:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        updateStatus(`Error: ${errorMessage}`);
        
        // Show user-friendly error message
        if (errorMessage.includes('Companion API failed')) {
            alert("I'm having trouble thinking right now. Please try again in a moment.");
        } else if (errorMessage.includes('generate BVH')) {
            alert("I couldn't create that animation. Try describing it differently.");
        } else if (errorMessage.includes('fetch')) {
            alert("Connection error. Please check if all services are running.");
        } else {
            alert("Something went wrong. Please try again.");
        }
        
    } finally {
        // Always restore button state
        generateBtn.classList.remove('disabled');
        generateBtn.textContent = 'Generate';
        console.log("Generation process finished");
        
        // Hide status after a delay
        setTimeout(() => {
            updateStatus("Ready");
        }, 3000);
    }
}

async function returnToStanding() {
    console.log("Returning to standing state...");
    
    try {
        // Remove loading overlay logic - commented out for testing
        // loadingOverlay.classList.remove('visible');
        
        if (!mixer || !currentModel || !standingClipData) {
            console.warn("Missing required components for returnToStanding");
            return;
        }

        const targetSkinnedMesh = currentModel.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
        if (!targetSkinnedMesh) {
            console.warn("No target skinned mesh found");
            return;
        }

        // Clean up any existing timeouts/intervals
        if (standingTimeout) {
            clearTimeout(standingTimeout);
            standingTimeout = undefined;
        }
        if ((currentModel as any).animationCycleInterval) {
            clearInterval((currentModel as any).animationCycleInterval);
            (currentModel as any).animationCycleInterval = null;
        }

        // Reset mixer and skeleton
        mixer.stopAllAction();
        targetSkinnedMesh.skeleton.pose();
        mixer = new THREE.AnimationMixer(targetSkinnedMesh);

        // Reset model position and scale
        if (currentModel && originalModelScale) {
            currentModel.scale.setScalar(originalModelScale);
            currentModel.position.set(0, -0.5, 0);
        }
        
        // Reset camera
        if (originalCameraPosition && originalCameraTarget) {
            camera.position.copy(originalCameraPosition);
            controls.target.copy(originalCameraTarget);
            controls.update();
        }

        // Start standing animation
        standingAction = mixer.clipAction(standingClipData);
        standingAction.setLoop(THREE.LoopRepeat, Infinity);
        standingAction.play();
        
        console.log("✅ Successfully returned to standing state");
        
    } catch (error) {
        console.error("Error in returnToStanding:", error);
        // Always ensure loading overlay is removed even on error
        // loadingOverlay.classList.remove('visible');
    }
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
            currentModel.position.set(0, -0.5, 0);
            
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
    const avatarContainer = document.getElementById('avatar');
    if (avatarContainer) {
        const rect = avatarContainer.getBoundingClientRect();
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
        renderer.setSize(rect.width, rect.height);
    } else {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
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
        currentModel.position.set(0, -0.5, 0);
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
    // Check if button is disabled
    if (debugBtn.classList.contains('disabled')) {
        return;
    }
    
    const filesToRerun = filenames || lastGeneratedFiles;
    
    if (!filesToRerun || filesToRerun.length === 0) {
        alert("No previous animation to rerun. Please generate an animation first.");
        return;
    }
    
    console.log("Rerunning animation with files:", filesToRerun);
    
    debugBtn.classList.add('disabled');
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
        debugBtn.classList.remove('disabled');
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

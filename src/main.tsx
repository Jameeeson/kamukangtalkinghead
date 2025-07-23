// main.tsx

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
}

const characters: CharacterData[] = [
    {
        name: 'Remy',
        subtitle: 'The Bystander',
        gltfPath: 'tryulet.glb',
        portraitPath: 'Remy.png',
        scale: 1.0,
        idleAnimationPath: 'remydefault.bvh',
    },
    {
        name: 'The Boss',
        subtitle: 'The Mafia Boss',
        gltfPath: 'Theboss.glb',
        portraitPath: 'Boss.png',
        scale: 150.0,
        idleAnimationPath: 'bossdefault.bvh',
    },
     {
        name: 'Tungtung Sahur',
        subtitle: 'The Brainrot',
        gltfPath: 'tungtungsahur.glb',
        portraitPath: 'tungtung.png',
        scale: 150.0,
        idleAnimationPath: 'tungtungdefault.bvh',
    },
];

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

// We need to store the raw idle clip data to restore it after a total reset
let idleClipData: THREE.AnimationClip | undefined;

const clock = new THREE.Clock();

// --- DOM Elements ---
const characterGrid = document.getElementById('character-grid')!;
const characterNameEl = document.getElementById('character-name')!;
const characterSubtitleEl = document.getElementById('character-subtitle')!;
const characterInput = document.getElementById('character-input') as HTMLInputElement;
const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
const loadingOverlay = document.getElementById('loading-overlay')!;
const debugBtn = document.getElementById('debug-btn') as HTMLButtonElement;


// --- Application Flow ---
init();
createCharacterGrid();
await selectCharacter(0);
animate();

// --- Initialization and Core Functions ---

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050a14);
    scene.fog = new THREE.Fog(0x050a14, 10, 50);
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
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
    window.addEventListener('resize', onWindowResize);
    generateBtn.addEventListener('click', handleGenerateClick);
    debugBtn.addEventListener('click', runSkeletonDebug);
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
        card.addEventListener('click', () => {
            selectCharacter(index);
        });
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
    if (currentModel) scene.remove(currentModel);
    if (mixer) {
        mixer.stopAllAction();
        mixer = undefined;
    }
    idleAction = undefined;
    idleClipData = undefined;

    const gltfLoader = new GLTFLoader();
    const bvhLoader = new BVHLoader();
    const [targetModel, idleBvh] = await Promise.all([
        gltfLoader.loadAsync(character.gltfPath),
        bvhLoader.loadAsync(character.idleAnimationPath),
    ]);
    
    currentModel = targetModel.scene;
    const targetSkinnedMesh = currentModel.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
    
        //<-- START: ADDED CODE -->
    // This will log the bone names of the loaded character model to the console.
    // Useful for setting up the 'names' map in the retargeting options.
    console.log(`%c--- Bones for ${character.name} ---`, 'color: #28a745; font-weight: bold; font-size: 1.2em;');
    const boneNames = targetSkinnedMesh.skeleton.bones.map(bone => bone.name);
    console.log(boneNames);
    console.log("You can use this array to correctly map the BVH skeleton to your model's skeleton in the retargeting options.");
    //<-- END: ADDED CODE -->

    currentModel.rotation.x = -Math.PI / 2;
    currentModel.scale.setScalar(character.scale);
    currentModel.position.set(0, 0, 0);
    currentModel.frustumCulled = false;
    scene.add(currentModel);

    // Create the first mixer instance
    mixer = new THREE.AnimationMixer(targetSkinnedMesh);

    const idleOptions = {
        hip: 'Hips',
        names: { 'mixamorigHips': 'Hips', 'mixamorigSpine': 'Spine', 'mixamorigSpine1': 'Spine1', 'mixamorigSpine2': 'Spine2', 'mixamorigNeck': 'Neck', 'mixamorigHead': 'Head', 'mixamorigLeftShoulder': 'LeftShoulder', 'mixamorigLeftArm': 'LeftArm', 'mixamorigLeftForeArm': 'LeftForeArm', 'mixamorigLeftHand': 'LeftHand', 'mixamorigRightShoulder': 'RightShoulder', 'mixamorigRightArm': 'RightArm', 'mixamorigRightForeArm': 'RightForeArm', 'mixamorigRightHand': 'RightHand', 'mixamorigLeftUpLeg': 'LeftUpLeg', 'mixamorigLeftLeg': 'LeftLeg', 'mixamorigLeftFoot': 'LeftFoot', 'mixamorigLeftToeBase': 'LeftToe', 'mixamorigRightUpLeg': 'RightUpLeg', 'mixamorigRightLeg': 'RightLeg', 'mixamorigRightFoot': 'RightFoot', 'mixamorigRightToeBase': 'RightToe' }
    };
    
    // Store the retargeted clip data so we can recreate the idle action later
    idleClipData = SkeletonUtils.retargetClip(targetSkinnedMesh, idleBvh.skeleton, idleBvh.clip, idleOptions);
    
    idleAction = mixer.clipAction(idleClipData);
    idleAction.setLoop(THREE.LoopRepeat, Infinity).play();
}

// --- API and Animation Sequence Logic ---

async function handleGenerateClick() {
    const prompt = characterInput.value.trim();
    if (!prompt || !currentModel) {
        alert("Please enter a prompt.");
        return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';
    
    // FADE IN to hide the reset process
    loadingOverlay.classList.add('visible');

    try {
        const response = await fetch(`${BACKEND_URL}/api/generate_bvh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompts: [prompt] }),
        });
        if (!response.ok) throw new Error((await response.json()).detail || 'Failed to generate animation.');
        
        const result = await response.json();
        const generatedFiles: string[] = result.files_created;
        
        if (generatedFiles && generatedFiles.length > 0) {
            await playGeneratedSequence(generatedFiles);
        } else {
            console.warn("Generation successful, but no files were returned.");
            await returnToIdle();
        }
    } catch (error) {
        console.error("Error during generation:", error);
        alert(`An error occurred: ${error instanceof Error ? error.message : String(error)}`);
        await returnToIdle();
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate';
    }
}

async function returnToIdle() {
    if (!mixer || !currentModel || !idleClipData) return;

    const targetSkinnedMesh = currentModel.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
    if (!targetSkinnedMesh) return;

    // Perform the same total reset to ensure a clean return to idle
    mixer.stopAllAction();
    targetSkinnedMesh.skeleton.pose();
    mixer = new THREE.AnimationMixer(targetSkinnedMesh);

    // Recreate the idle action from the stored clip data
    idleAction = mixer.clipAction(idleClipData);
    idleAction.setLoop(THREE.LoopRepeat, Infinity).play();

    // Fade out the overlay now that idle is playing cleanly
    loadingOverlay.classList.remove('visible');
}

/**
 * The "Nuke and Pave" function. It completely resets the animation system
 * before playing the new sequence.
 */
async function playGeneratedSequence(filenames: string[]) {
    if (!mixer || !currentModel) {
        await returnToIdle();
        return;
    }

    const targetSkinnedMesh = currentModel.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
    if (!targetSkinnedMesh) {
        await returnToIdle();
        return;
    }

    // --- 1. THE TOTAL CLEAR (Done behind the fade) ---
    // Stop every animation currently running on the mixer.
    mixer.stopAllAction();

    // Reset the skeleton to its original bind pose. This is the most crucial step.
    // The model will be in a static T-Pose (or A-Pose) at this point.
    targetSkinnedMesh.skeleton.pose();

    // Completely destroy the old mixer and create a brand new, clean one.
    // This removes any possibility of lingering state, caches, or listeners.
    mixer = new THREE.AnimationMixer(targetSkinnedMesh);


    // --- 2. STARTING NEW ---
    const bvhLoader = new BVHLoader();
    const retargetOptions = {
    // This tells the retargeting utility that the main root/hip bone
    // of YOUR model is named 'Hips'.
    hip: 'Hips',

    // This is the main mapping dictionary.
    // It maps: { 'BVH_bone_name': 'Your_model_bone_name' }
    names: {
        // Spine
        'mixamorigHips': 'Hips',
        'mixamorigSpine': 'Spine',
        'mixamorigSpine1': 'Chest', // Mapping the second spine bone to your Chest bone
        // Your model doesn't have a Spine2, so we omit it.

        // Head
        'mixamorigNeck': 'Neck',
        'mixamorigHead': 'Head',

        // Left Arm
        'mixamorigLeftShoulder': 'Left_shoulder',
        'mixamorigLeftArm': 'Left_arm',         // Mixamo's "Arm" is the upper arm
        'mixamorigLeftForeArm': 'Left_elbow',      // Mixamo's "ForeArm" is the lower arm
        'mixamorigLeftHand': 'Left_wrist',

        // Right Arm
        'mixamorigRightShoulder': 'Right_shoulder',
        'mixamorigRightArm': 'Right_arm',
        'mixamorigRightForeArm': 'Right_elbow',
        'mixamorigRightHand': 'Right_wrist',

        // Left Leg
        'mixamorigLeftUpLeg': 'Left_Leg',        // Mixamo's "UpLeg" is the thigh
        'mixamorigLeftLeg': 'Left_knee',         // Mixamo's "Leg" is the shin/calf
        'mixamorigLeftFoot': 'Left_ankle',
        'mixamorigLeftToeBase': 'Left_toe',

        // Right Leg
        'mixamorigRightUpLeg': 'Right_Leg',
        'mixamorigRightLeg': 'Right_knee',
        'mixamorigRightFoot': 'Right_ankle',
        'mixamorigRightToeBase': 'Right_toe',
    }
};

    let clips: BVH[];
    try {
        clips = await Promise.all(
            filenames.map(filename => bvhLoader.loadAsync(`${BACKEND_URL}/generated_bvh/${filename}`))
        );
    } catch (error) {
        console.error("Failed to load generated BVH files:", error);
        await returnToIdle();
        return;
    }

    const sequenceActions = clips.map(bvh => {
        const clip = SkeletonUtils.retargetClip(targetSkinnedMesh, bvh.skeleton, bvh.clip, retargetOptions);
        const action = mixer!.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        return action;
    });

    if (sequenceActions.length === 0) {
        await returnToIdle();
        return;
    }
    
    // --- 3. PLAY THE NEW ANIMATION ---
    // Set up the listener on the NEW mixer to chain animations.
    let currentActionIndex = 0;
    const onLoopFinished = () => {
        // Remove the listener from the old action
        mixer?.removeEventListener('finished', onLoopFinished);

        // Get the next action in the sequence, looping back to the start
        currentActionIndex = (currentActionIndex + 1) % sequenceActions.length;
        const nextAction = sequenceActions[currentActionIndex];

        // Fade from the current action to the next one
        const currentAction = sequenceActions[(currentActionIndex + sequenceActions.length - 1) % sequenceActions.length];
        currentAction.crossFadeTo(nextAction, 0.3, true);
        
        // Play the next action and re-attach the listener
        nextAction.play();
        mixer?.addEventListener('finished', onLoopFinished);
    };
    
    // Play the very first action. Since the model is in a static pose,
    // we don't need to cross-fade. We just start it.
    sequenceActions[0].play();
    mixer.addEventListener('finished', onLoopFinished);
    
    // --- 4. REVEAL THE RESULT ---
    // Fade out the overlay now that the new animation is playing cleanly.
    loadingOverlay.classList.remove('visible');
}

// --- Utility Functions ---
async function runSkeletonDebug() {
    const prompt = characterInput.value.trim();
    if (!prompt) {
        alert("Please enter a prompt to generate a BVH file for debugging.");
        return;
    }

    if (!currentModel) {
        alert("Please select a character first.");
        return;
    }

    console.log('%c--- RUNNING SKELETON DEBUG MODE ---', 'color: red; font-size: 1.5em;');
    alert('Entering Skeleton Debug Mode. The animation will not play. Look at the scene to compare the two skeletons. GREEN is your character, YELLOW is the BVH.');

    // --- 1. Generate a BVH file from the backend ---
    debugBtn.disabled = true;
    debugBtn.textContent = 'Debugging...';
    let generatedFiles: string[];
    try {
        const response = await fetch(`${BACKEND_URL}/api/generate_bvh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompts: [prompt] }),
        });
        if (!response.ok) throw new Error('Failed to generate BVH for debug.');
        const result = await response.json();
        generatedFiles = result.files_created;
        if (!generatedFiles || generatedFiles.length === 0) {
            throw new Error('Backend did not return a BVH file.');
        }
    } catch (error) {
        alert(`Error generating BVH for debug: ${error}`);
        debugBtn.disabled = false;
        debugBtn.textContent = 'Debug Skeletons';
        return;
    }

    // --- 2. Clean up the scene for a clear view ---
    if (mixer) {
        mixer.stopAllAction();
    }
    // Remove the character model but keep it in memory
    scene.remove(currentModel);

    // --- 3. Create and display the CHARACTER's skeleton helper ---
    // Make sure the skeleton is in its default bind pose
    const skinnedMesh = currentModel.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh;
    skinnedMesh.skeleton.pose();

    const characterHelper = new THREE.SkeletonHelper(skinnedMesh);
    (characterHelper.material as THREE.LineBasicMaterial).color.setHex(0x00ff00); // Green for character
    characterHelper.position.set(-1, 0, 0); // Position on the left
    scene.add(characterHelper);
    console.log("Character Skeleton (GREEN) is on the left.");


    // --- 4. Load the generated BVH and display ITS skeleton helper ---
    const bvhLoader = new BVHLoader();
    try {
        const bvh = await bvhLoader.loadAsync(`${BACKEND_URL}/generated_bvh/${generatedFiles[0]}`);
        
        // The BVH loader doesn't create a visible object, just data.
        // We create a "dummy" group to attach the skeleton helper to.
        const bvhGroup = new THREE.Group();
        bvhGroup.add(bvh.skeleton.bones[0]); // Add the root bone
        
        const bvhHelper = new THREE.SkeletonHelper(bvhGroup);
        (bvhHelper.material as THREE.LineBasicMaterial).color.setHex(0xffff00); // Yellow for BVH
        bvhHelper.position.set(1, 0, 0); // Position on the right
        scene.add(bvhHelper);
        console.log("Generated BVH Skeleton (YELLOW) is on the right.");

    } catch (error) {
        alert(`Error loading the generated BVH file: ${error}`);
    }

    // --- 5. Finalize ---
    alert('Debug view is now active. Orbit the camera to compare the poses and proportions. Refresh the page to exit debug mode.');
    debugBtn.disabled = false;
    debugBtn.textContent = 'Debug Skeletons';
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
    controls.update();
    renderer.render(scene, camera);
    stats.update();
}
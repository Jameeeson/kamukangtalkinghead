import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BVHLoader } from "three/addons/loaders/BVHLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { Sky } from 'three/examples/jsm/objects/Sky.js';

// --- Simplified interface for Ready Player Me models ---
interface CharacterData {
  name: string;
  subtitle: string;
  gltfPath: string;
  portraitPath: string;
  scale: number;
  rotation?: [number, number, number];

  // Bone names for procedural idle are now required
  bones: {
    head: string;
    spine: string;
    leftEye: string;
    rightEye: string;
  };

  // Morph target configurations, specific to each model
  morphs: {
    blink: string[];
    lipsync: { [key: string]: string[] };
    emotions: { [key: string]: { [key: string]: number } };
  };
}

const characters: CharacterData[] = [
  {
    name: "Harry",
    subtitle: "Roque",
    gltfPath: "/Harry.glb", // Make sure this file is in your /public folder
    portraitPath: "/Harry.png", // Add a portrait for him
    scale: 1.3,
    rotation: [0, 0, 0],
    bones: {
      // Bone names from the actual tpose.glb model structure
      head: "Head",
      spine: "Spine2",
      leftEye: "LeftEye",
      rightEye: "RightEye",
    },
    morphs: {
      blink: ["eyeBlinkLeft", "eyeBlinkRight"],
      lipsync: {
        // Updated for tpose.glb model morph targets
        A: ["jawOpen", "mouthOpen"],
        I: ["mouthStretchLeft", "mouthStretchRight"],
        U: ["mouthFunnel"],
        E: ["mouthShrugUpper"],
        O: ["mouthPucker"],
      },
      emotions: {
        // Updated for tpose.glb model morph targets
        neutral: {},
        happy: { mouthSmile: 1.0, cheekSquintLeft: 0.7, cheekSquintRight: 0.7 },
        angry: {
          browDownLeft: 1.0,
          browDownRight: 1.0,
          mouthFrownLeft: 0.8,
          mouthFrownRight: 0.8,
        },
        sad: {
          browInnerUp: 1.0,
          mouthPucker: 0.5,
          mouthFrownLeft: 0.5,
          mouthFrownRight: 0.5,
        },
        surprised: {
          eyeWideLeft: 1.0,
          eyeWideRight: 1.0,
          jawOpen: 0.6,
          browInnerUp: 1.0,
        },
        wink: { eyeBlinkRight: 1.0, browInnerUp: 0.5 },
      },
    },
  },
  {
    name: "Joy",
    subtitle: "Dishwashing Liquid",
    gltfPath: "/Joy.glb", // Make sure this file is in your /public folder
    portraitPath: "/Joy.png", // Add a portrait for him
    scale: 1.3,
    rotation: [0, 0, 0],
    bones: {
      // Bone names from the actual tpose.glb model structure
      head: "Head",
      spine: "Spine2",
      leftEye: "LeftEye",
      rightEye: "RightEye",
    },
    morphs: {
      blink: ["eyeBlinkLeft", "eyeBlinkRight"],
      lipsync: {
        // Updated for tpose.glb model morph targets
        A: ["jawOpen", "mouthOpen"],
        I: ["mouthStretchLeft", "mouthStretchRight"],
        U: ["mouthFunnel"],
        E: ["mouthShrugUpper"],
        O: ["mouthPucker"],
      },
      emotions: {
        // Updated for tpose.glb model morph targets
        neutral: {},
        happy: { mouthSmile: 1.0, cheekSquintLeft: 0.7, cheekSquintRight: 0.7 },
        angry: {
          browDownLeft: 1.0,
          browDownRight: 1.0,
          mouthFrownLeft: 0.8,
          mouthFrownRight: 0.8,
        },
        sad: {
          browInnerUp: 1.0,
          mouthPucker: 0.5,
          mouthFrownLeft: 0.5,
          mouthFrownRight: 0.5,
        },
        surprised: {
          eyeWideLeft: 1.0,
          eyeWideRight: 1.0,
          jawOpen: 0.6,
          browInnerUp: 1.0,
        },
        wink: { eyeBlinkRight: 1.0, browInnerUp: 0.5 },
      },
    },
  },
  {
    name: "Joy",
    subtitle: "Dishwashing Liquid",
    gltfPath: "/Surf.glb", // Make sure this file is in your /public folder
    portraitPath: "/Joy.png", // Add a portrait for him
    scale: 1.3,
    rotation: [0, 0, 0],
    bones: {
      // Bone names from the actual tpose.glb model structure
      head: "Head",
      spine: "Spine2",
      leftEye: "LeftEye",
      rightEye: "RightEye",
    },
    morphs: {
      blink: ["eyeBlinkLeft", "eyeBlinkRight"],
      lipsync: {
        // Updated for tpose.glb model morph targets
        A: ["jawOpen", "mouthOpen"],
        I: ["mouthStretchLeft", "mouthStretchRight"],
        U: ["mouthFunnel"],
        E: ["mouthShrugUpper"],
        O: ["mouthPucker"],
      },
      emotions: {
        // Updated for tpose.glb model morph targets
        neutral: {},
        happy: { mouthSmile: 1.0, cheekSquintLeft: 0.7, cheekSquintRight: 0.7 },
        angry: {
          browDownLeft: 1.0,
          browDownRight: 1.0,
          mouthFrownLeft: 0.8,
          mouthFrownRight: 0.8,
        },
        sad: {
          browInnerUp: 1.0,
          mouthPucker: 0.5,
          mouthFrownLeft: 0.5,
          mouthFrownRight: 0.5,
        },
        surprised: {
          eyeWideLeft: 1.0,
          eyeWideRight: 1.0,
          jawOpen: 0.6,
          browInnerUp: 1.0,
        },
        wink: { eyeBlinkRight: 1.0, browInnerUp: 0.5 },
      },
    },
  },

  // You can easily add more RPM characters here by copying the structure above
];

let vrmMeshes: THREE.SkinnedMesh[] = [];
let idleBlinker: IdleBlinker | undefined;
let lipSync: LipSync | undefined;
let idleManager: IdleManager | undefined; // The procedural idle manager
let audioContext: AudioContext | undefined;
let currentCharacter: CharacterData | undefined;

// --- NEW: Retargeting options specifically for RPM skeletons ---
// This maps bones from a standard BVH file to the RPM skeleton.
const RPM_RETARGET_OPTIONS = {
  hip: "Hips",
  names: {
    // --- Spine and Head ---
    Spine: "Spine",
    Spine1: "Spine1",
    Spine2: "Spine2",
    Neck: "Neck",
    Head: "Head",
    HeadTop_End: "Head",
    LeftEye: "Head",
    RightEye: "Head",

    // --- Left Arm ---
    LeftShoulder: "LeftShoulder",
    LeftArm: "LeftArm",
    LeftForeArm: "LeftForeArm",
    LeftHand: "LeftHand",

    // --- Left Hand Fingers (CRITICAL - RESTORED) ---
    // Map target finger bones to the hand bone to inherit its rotation.
    LeftHandThumb1: "LeftHand",
    LeftHandThumb2: "LeftHand",
    LeftHandThumb3: "LeftHand",
    LeftHandThumb4: "LeftHand",
    LeftHandIndex1: "LeftHand",
    LeftHandIndex2: "LeftHand",
    LeftHandIndex3: "LeftHand",
    LeftHandIndex4: "LeftHand",
    LeftHandMiddle1: "LeftHand",
    LeftHandMiddle2: "LeftHand",
    LeftHandMiddle3: "LeftHand",
    LeftHandMiddle4: "LeftHand",
    LeftHandRing1: "LeftHand",
    LeftHandRing2: "LeftHand",
    LeftHandRing3: "LeftHand",
    LeftHandRing4: "LeftHand",
    LeftHandPinky1: "LeftHand",
    LeftHandPinky2: "LeftHand",
    LeftHandPinky3: "LeftHand",
    LeftHandPinky4: "LeftHand",

    // --- Right Arm ---
    RightShoulder: "RightShoulder",
    RightArm: "RightArm",
    RightForeArm: "RightForeArm",
    RightHand: "RightHand",

    // --- Right Hand Fingers (CRITICAL - RESTORED) ---
    RightHandThumb1: "RightHand",
    RightHandThumb2: "RightHand",
    RightHandThumb3: "RightHand",
    RightHandThumb4: "RightHand",
    RightHandIndex1: "RightHand",
    RightHandIndex2: "RightHand",
    RightHandIndex3: "RightHand",
    RightHandIndex4: "RightHand",
    RightHandMiddle1: "RightHand",
    RightHandMiddle2: "RightHand",
    RightHandMiddle3: "RightHand",
    RightHandMiddle4: "RightHand",
    RightHandRing1: "RightHand",
    RightHandRing2: "RightHand",
    RightHandRing3: "RightHand",
    RightHandRing4: "RightHand",
    RightHandPinky1: "RightHand",
    RightHandPinky2: "RightHand",
    RightHandPinky3: "RightHand",
    RightHandPinky4: "RightHand",

    // --- Left Leg ---
    LeftUpLeg: "LeftUpLeg",
    LeftLeg: "LeftLeg",
    LeftFoot: "LeftFoot",
    LeftToeBase: "LeftToe",
    LeftToe_End: "LeftToe",

    // --- Right Leg ---
    RightUpLeg: "RightUpLeg",
    RightLeg: "RightLeg",
    RightFoot: "RightFoot",
    RightToeBase: "RightToe",
    RightToe_End: "RightToe",
  },
};

class IdleManager {
  modelRoot: THREE.Group;
  camera: THREE.PerspectiveCamera;
  headBone?: THREE.Bone;
  spineBone?: THREE.Bone;
  leftEyeBone?: THREE.Bone;
  rightEyeBone?: THREE.Bone;

  initialHeadRot!: THREE.Quaternion;
  initialEyeLRot!: THREE.Quaternion;
  initialEyeRRot!: THREE.Quaternion;

  nextEyeMoveTime = 0;
  nextHeadMoveTime = 0;
  lookAtCameraUntil = 0;

  targetEyeRot = new THREE.Quaternion();
  targetHeadRot = new THREE.Quaternion();

  isInitialized = false;
  isActive = true;

  // --- Gaze Control Properties ---
  private lookAtTarget: THREE.Vector3 | null = null;
  private targetHeadQuat = new THREE.Quaternion();
  private targetEyeQuat = new THREE.Quaternion();
  
  // --- Mouse Gaze Delay Properties ---
  private lastMouseUpdate = 0;
  private mouseGazeDelay = 500; // 500ms delay before following mouse
  private pendingMouseTarget: THREE.Vector3 | null = null;

  constructor(
    modelRoot: THREE.Group,
    camera: THREE.PerspectiveCamera,
    boneNames: CharacterData["bones"]
  ) {
    this.modelRoot = modelRoot;
    this.camera = camera;

    if (!boneNames) {
      console.error(
        "[IdleManager] CRITICAL: Bone names not provided in character data."
      );
      return;
    }

    this.headBone = this.findBone(boneNames.head);
    this.spineBone = this.findBone(boneNames.spine);
    this.leftEyeBone = this.findBone(boneNames.leftEye);
    this.rightEyeBone = this.findBone(boneNames.rightEye);

    if (
      !this.headBone ||
      !this.spineBone ||
      !this.leftEyeBone ||
      !this.rightEyeBone
    ) {
      console.error(
        "[IdleManager] CRITICAL: Not all essential bones found. Idle animations disabled."
      );
      console.log({
        head: !!this.headBone,
        spine: !!this.spineBone,
        eyes: !!this.leftEyeBone,
      });
      return;
    }

    // IMPORTANT: Store the initial world quaternions. This is key for the new logic.
    this.headBone.getWorldQuaternion(this.initialHeadRot = new THREE.Quaternion());
    this.leftEyeBone.getWorldQuaternion(this.initialEyeLRot = new THREE.Quaternion());
    this.rightEyeBone.getWorldQuaternion(this.initialEyeRRot = new THREE.Quaternion());

    this.isInitialized = true;
    console.log(
      "[IdleManager] Advanced Idle Animation Manager initialized successfully."
    );
  }

  findBone(name: string): THREE.Bone | undefined {
    let bone: THREE.Bone | undefined = undefined;
    this.modelRoot.traverse((object) => {
      if (object instanceof THREE.Bone && object.name === name) {
        bone = object;
      }
    });
    return bone;
  }

  setActive(active: boolean) {
    this.isActive = active;
    if (!active && this.isInitialized) {
      const tempQuat = new THREE.Quaternion();
      this.headBone?.parent?.getWorldQuaternion(tempQuat);
      this.headBone?.quaternion.copy(tempQuat.invert()).multiply(this.initialHeadRot);

      this.leftEyeBone?.parent?.getWorldQuaternion(tempQuat);
      this.leftEyeBone?.quaternion.copy(tempQuat.invert()).multiply(this.initialEyeLRot);

      this.rightEyeBone?.parent?.getWorldQuaternion(tempQuat);
      this.rightEyeBone?.quaternion.copy(tempQuat.invert()).multiply(this.initialEyeRRot);
    }
  }

  public setLookAtTarget(target: THREE.Vector3 | null) {
    this.lookAtTarget = target;
  }

  lookAtCamera(durationMs = 3000) {
    if (!this.isInitialized) return;
    this.lookAtCameraUntil = performance.now() + durationMs;
    const camPos = new THREE.Vector3();
    this.camera.getWorldPosition(camPos);
    this.setLookAtTarget(camPos);
    
    // After the duration, stop looking at the camera
    setTimeout(() => {
        if(this.lookAtCameraUntil !== 0){ // Check if another call hasn't overridden this one
             this.lookAtCameraUntil = 0;
             this.setLookAtTarget(null);
        }
    }, durationMs);
  }

  update(deltaTime: number) {
    if (!this.isInitialized || !this.isActive) return;

    if (this.lookAtTarget) {
      this.performLookAt(this.lookAtTarget, deltaTime);
    } else {
      const now = performance.now();
      this.updateBodySway(now);
      this.updateHeadMovement(now, deltaTime);
      this.updateEyeMovement(now, deltaTime);
    }
  }

 private performLookAt(target: THREE.Vector3, deltaTime: number) {
        // Head tracking is fine, no change needed here
        if (this.headBone) {
            this.lookAtBone(this.headBone, target, this.initialHeadRot, deltaTime, 2.0, 0.5);
        }
        
        // --- NEW EYE LOGIC ---
        // 1. Calculate the required local rotation for an eye ONCE.
        // We'll use the left eye as the reference to calculate the target quaternion.
        if (this.leftEyeBone) {
            this.calculateTargetLocalQuat(
                this.leftEyeBone, 
                target, 
                this.initialEyeLRot, 
                this.targetEyeQuat, // Store the result in targetEyeQuat
                1.0 // limit
            );

            // 2. Smoothly apply the calculated rotation to BOTH eyes.
            this.leftEyeBone.quaternion.slerp(this.targetEyeQuat, deltaTime * 8.0);
            
            if (this.rightEyeBone) {
                // The right eye simply mirrors the left eye's target rotation.
                this.rightEyeBone.quaternion.slerp(this.targetEyeQuat, deltaTime * 8.0);
            }
        }
    }

    // --- REFACTOR: `lookAtBone` is now split into two functions ---

    // 1. A general-purpose function that calculates the target quaternion but does NOT apply it.
    private calculateTargetLocalQuat(
        bone: THREE.Bone,
        target: THREE.Vector3,
        initialWorldQuat: THREE.Quaternion,
        resultQuat: THREE.Quaternion, // The quaternion to store the result in
        limit: number
    ) {
        const bonePos = new THREE.Vector3();
        bone.getWorldPosition(bonePos);

        const targetDirection = new THREE.Vector3().subVectors(target, bonePos).normalize();
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(initialWorldQuat).normalize();
        const rotation = new THREE.Quaternion().setFromUnitVectors(forward, targetDirection);
        const targetWorldQuat = initialWorldQuat.clone().multiply(rotation);
        const limitedWorldQuat = initialWorldQuat.clone().slerp(targetWorldQuat, limit);

        const parentWorldQuat = new THREE.Quaternion();
        bone.parent?.getWorldQuaternion(parentWorldQuat);

        // Store the final local quaternion in the provided resultQuat
        resultQuat.copy(parentWorldQuat.invert().multiply(limitedWorldQuat));
    }

    // 2. The original lookAtBone function, now simplified to use the calculator.
    // This is now ONLY used by the head bone.
    private lookAtBone(
        bone: THREE.Bone,
        target: THREE.Vector3,
        initialWorldQuat: THREE.Quaternion,
        deltaTime: number,
        speed: number,
        limit: number
    ) {
        // We use a temporary quaternion for the head calculation
        const tempTargetLocalQuat = new THREE.Quaternion();
        this.calculateTargetLocalQuat(bone, target, initialWorldQuat, tempTargetLocalQuat, limit);
        bone.quaternion.slerp(tempTargetLocalQuat, deltaTime * speed);
    }
  performLookAtCamera(deltaTime: number) {
    // This function is now effectively handled by the main lookAtCamera method
    // but we can keep it for legacy compatibility if needed, or remove it.
  }

  updateBodySway(time: number) {
    if (!this.spineBone) return;
    this.spineBone.rotation.z = Math.sin(time / 4000) * 0.03;
    this.spineBone.rotation.x = Math.sin(time / 3000) * 0.03;
  }

  updateHeadMovement(time: number, deltaTime: number) {
    // This will only run when lookAtTarget is null
    if (!this.headBone) return;
    if (time > this.nextHeadMoveTime) {
      const euler = new THREE.Euler(
        THREE.MathUtils.randFloat(-0.1, 0.1),
        THREE.MathUtils.randFloat(-0.15, 0.15),
        THREE.MathUtils.randFloat(-0.05, 0.05),
        "XYZ"
      );
      this.targetHeadRot.setFromEuler(euler);
      this.nextHeadMoveTime = time + THREE.MathUtils.randFloat(3000, 6000);
    }
    const finalLocalQuat = this.headBone.quaternion.clone().multiply(this.targetHeadRot);
    this.headBone.quaternion.slerp(finalLocalQuat, deltaTime * 0.5);
  }

  updateEyeMovement(time: number, deltaTime: number) {
    // This will only run when lookAtTarget is null
    if (!this.leftEyeBone || !this.rightEyeBone) return;
    if (time > this.nextEyeMoveTime) {
      const euler = new THREE.Euler(
        THREE.MathUtils.randFloat(-0.2, 0.2),
        THREE.MathUtils.randFloat(-0.35, 0.35),
        0,
        "XYZ"
      );
      this.targetEyeRot.setFromEuler(euler);
      this.nextEyeMoveTime = time + THREE.MathUtils.randFloat(500, 2500);
    }
    const finalEyeLRot = this.leftEyeBone.quaternion.clone().multiply(this.targetEyeRot);
    const finalEyeRRot = this.rightEyeBone.quaternion.clone().multiply(this.targetEyeRot);

    this.leftEyeBone.quaternion.slerp(finalEyeLRot, deltaTime * 8.0);
    this.rightEyeBone.quaternion.slerp(finalEyeRRot, deltaTime * 8.0);
  }
}

class IdleBlinker {
  meshes: THREE.SkinnedMesh[];
  nextBlinkTime: number;
  isBlinking: boolean;
  blinkMorphNames: string[];

  constructor(
    meshes: THREE.SkinnedMesh[],
    morphConfig: CharacterData["morphs"]
  ) {
    this.meshes = meshes;
    this.blinkMorphNames = morphConfig.blink;
    this.nextBlinkTime = 0;
    this.isBlinking = false;
    this.setNextBlink();
  }
  setNextBlink() {
    const nextBlinkDelay = 2000 + Math.random() * 6000;
    this.nextBlinkTime = performance.now() + nextBlinkDelay;
  }
  update(time: number) {
    if (
      this.meshes.length === 0 ||
      this.isBlinking ||
      lipSync?.isTalking() ||
      time < this.nextBlinkTime
    ) {
      return;
    }
    this.isBlinking = true;
    this.triggerBlink();
  }
  triggerBlink() {
    const blinkDuration = 150;
    const startTime = performance.now();
    const dictionary = this.meshes[0].morphTargetDictionary;
    if (!dictionary) {
      this.isBlinking = false;
      return;
    }

    const blinkIndices = this.blinkMorphNames
      .map((name) => dictionary[name])
      .filter((index) => index !== undefined);

    if (blinkIndices.length === 0) {
      console.error(
        `Could not find blink morphs: ${this.blinkMorphNames.join(", ")}.`
      );
      this.isBlinking = false;
      return;
    }

    const doBlink = (currentTime: number) => {
      const elapsedTime: number = currentTime - startTime;
      let value: number =
        elapsedTime < blinkDuration / 2
          ? elapsedTime / (blinkDuration / 2)
          : 1.0 - (elapsedTime - blinkDuration / 2) / (blinkDuration / 2);

      if (elapsedTime >= blinkDuration) {
        this.meshes.forEach((mesh: THREE.SkinnedMesh) => {
          if (mesh.morphTargetInfluences) {
            blinkIndices.forEach(
              (index) => (mesh.morphTargetInfluences![index] = 0)
            );
          }
        });
        this.isBlinking = false;
        this.setNextBlink();
        return;
      }

      this.meshes.forEach((mesh: THREE.SkinnedMesh) => {
        if (mesh.morphTargetInfluences) {
          blinkIndices.forEach(
            (index) => (mesh.morphTargetInfluences![index] = value)
          );
        }
      });
      requestAnimationFrame(doBlink);
    };
    requestAnimationFrame(doBlink);
  }
}

class LipSync {
  meshes: THREE.SkinnedMesh[];
  lipSyncMap: { [key: string]: string[] };
  vowelShapes: string[];
  lastVowel: string | null;
  intervalId: NodeJS.Timeout | null;

  constructor(
    meshes: THREE.SkinnedMesh[],
    morphConfig: CharacterData["morphs"]
  ) {
    this.meshes = meshes;
    this.lipSyncMap = morphConfig.lipsync;
    this.vowelShapes = Object.keys(this.lipSyncMap);
    this.lastVowel = null;
    this.intervalId = null;

    // Debug: Check if morph targets exist for lip sync
    console.log(
      `%c--- LipSync Debug Info ---`,
      "color: #ff6600; font-weight: bold;"
    );
    console.log(`Number of meshes: ${meshes.length}`);
    console.log(`Vowel shapes to use: ${this.vowelShapes.join(", ")}`);

    // Prioritize head and teeth meshes for morph targets
    const facialMeshes = meshes.filter(
      (mesh) =>
        mesh.name.includes("Head") ||
        mesh.name.includes("Teeth") ||
        mesh.name.includes("head") ||
        mesh.name.includes("teeth")
    );

    console.log(
      `Found ${facialMeshes.length} facial meshes:`,
      facialMeshes.map((m) => m.name)
    );

    // Reorder meshes to put facial meshes first
    if (facialMeshes.length > 0) {
      const otherMeshes = meshes.filter((mesh) => !facialMeshes.includes(mesh));
      this.meshes = [...facialMeshes, ...otherMeshes];
      console.log(
        `Reordered meshes - facial meshes first:`,
        this.meshes.map((m) => m.name)
      );
    }

    if (meshes.length > 0 && this.meshes[0].morphTargetDictionary) {
      const dict = this.meshes[0].morphTargetDictionary;
      console.log(
        `Checking for required morph targets in: ${this.meshes[0].name}`
      );

      this.vowelShapes.forEach((vowel) => {
        const morphNames = this.lipSyncMap[vowel];
        console.log(`  ${vowel}: ${morphNames.join(", ")}`);
        morphNames.forEach((morphName) => {
          if (dict[morphName] !== undefined) {
            console.log(`    ✓ ${morphName} found at index ${dict[morphName]}`);
          } else {
            console.log(`    ✗ ${morphName} NOT found`);
          }
        });
      });
    }
    console.log(
      `%c--- End LipSync Debug ---`,
      "color: #ff6600; font-weight: bold;"
    );
  }
  isTalking() {
    return this.intervalId !== null;
  }
  start() {
    console.log("[LipSync] Starting lip sync animation");
    if (this.isTalking()) this.stop();

    if (this.meshes.length === 0) {
      console.error("[LipSync] No meshes available for lip sync");
      return;
    }

    console.log(`[LipSync] Debug: meshes.length = ${this.meshes.length}`);

    // Find a mesh with morph targets
    let targetMesh: THREE.SkinnedMesh | null = null;
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      console.log(
        `[LipSync] Debug: mesh[${i}] name = ${mesh.name || "unnamed"}`
      );
      console.log(
        `[LipSync] Debug: mesh[${i}] morphTargetDictionary exists = ${!!mesh.morphTargetDictionary}`
      );

      if (mesh.morphTargetDictionary) {
        console.log(
          `[LipSync] Debug: mesh[${i}] has ${
            Object.keys(mesh.morphTargetDictionary).length
          } morph targets`
        );
        targetMesh = mesh;
        break;
      }
    }

    if (!targetMesh) {
      console.warn(
        "[LipSync] This model doesn't support facial animation (no morph targets found)"
      );
      console.warn("[LipSync] Lip sync will be skipped for this model");
      return;
    }

    console.log(
      `[LipSync] Using mesh: ${targetMesh.name || "unnamed"} for lip sync`
    );

    // Move the mesh with morph targets to the front for easier access
    if (targetMesh !== this.meshes[0]) {
      const index = this.meshes.indexOf(targetMesh);
      this.meshes.splice(index, 1);
      this.meshes.unshift(targetMesh);
      console.log(`[LipSync] Moved target mesh to front of array`);
    }

    this.intervalId = setInterval(() => {
      if (this.meshes.length === 0) return;

      if (this.lastVowel) {
        this.setMorphs(this.lipSyncMap[this.lastVowel], 0);
      }

      let newVowel: string = this.lastVowel!;
      while (newVowel === this.lastVowel) {
        newVowel =
          this.vowelShapes[Math.floor(Math.random() * this.vowelShapes.length)];
      }

      const value = 0.4 + 0.2 * Math.random(); // Reduced from 0.6 + 0.4 for more subtle lip sync
      console.log(`[LipSync] Setting ${newVowel} to ${value.toFixed(2)}`);
      this.setMorphs(this.lipSyncMap[newVowel], value);
      this.lastVowel = newVowel;
    }, 130); // ← THIS IS THE TIMING! Change to: 80 = faster, 120 = normal, 200 = slower

    console.log("[LipSync] Lip sync interval started");
  }
  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    if (this.lastVowel) {
      this.setMorphs(this.lipSyncMap[this.lastVowel], 0);
    }
    this.lastVowel = null;
    setTimeout(() => applyEmotion(currentEmotion), 100);
  }

  setMorphs(shapeNames: string[], value: number) {
    if (this.meshes.length === 0) return;
    const dictionary = this.meshes[0].morphTargetDictionary;
    if (!dictionary) return;
    shapeNames.forEach((shapeName) => {
      const index = dictionary[shapeName];
      if (index !== undefined) {
        this.meshes.forEach((mesh) => {
          if (mesh.morphTargetInfluences)
            mesh.morphTargetInfluences[index] = value;
        });
      }
    });
  }
}

// --- NEW: Class for managing BVH-based idle animations ---
// --- NEW: Class for managing BVH-based idle animations ---
class BvhIdlePlayer {
  mixer: THREE.AnimationMixer;
  targetMesh: THREE.SkinnedMesh;
  idleBvhFiles: string[];
  bvhLoader: BVHLoader;
  retargetOptions: any;

  actions: THREE.AnimationAction[] = [];
  currentAction: THREE.AnimationAction | null = null;
  isInitialized = false;
  isActive = false;
  nextActionTimeoutId: number | null = null;

  constructor(
    mixer: THREE.AnimationMixer,
    targetMesh: THREE.SkinnedMesh,
    idleBvhFiles: string[],
    retargetOptions: any
  ) {
    this.mixer = mixer;
    this.targetMesh = targetMesh;
    this.idleBvhFiles = idleBvhFiles;
    this.bvhLoader = new BVHLoader();
    this.retargetOptions = retargetOptions;

    this.mixer.addEventListener("finished", this.onActionFinished.bind(this));
  }

  async initialize() {
    if (this.isInitialized || this.idleBvhFiles.length === 0) return;

    updateStatus("Loading idle animations...");
    console.log(
      "[BvhIdlePlayer] Initializing with animations:",
      this.idleBvhFiles
    );
    try {
      for (const filename of this.idleBvhFiles) {
        // Load the actual file specified in the filename
        const bvh = await this.bvhLoader.loadAsync(`/${filename}`);

        // --- ADDED: Log the BVH bone names for debugging ---
        console.log(
          `%c--- [BvhIdlePlayer] Bones for ${filename}: ---`,
          "color: #007bff; font-weight: bold;"
        );
        console.log(bvh.skeleton.bones.map((b: THREE.Bone) => b.name));
        console.log(
          "%c-------------------------------------------",
          "color: #007bff; font-weight: bold;"
        );

        const retargetedClip = SkeletonUtils.retargetClip(
          this.targetMesh,
          bvh.skeleton,
          bvh.clip,
          this.retargetOptions
        );
        const action = this.mixer.clipAction(retargetedClip);
        action.setLoop(THREE.LoopRepeat, Infinity); // Loop continuously for idle
        action.clampWhenFinished = false; // Don't clamp since it's looping
        this.actions.push(action);
      }
      this.isInitialized = true;
      this.setActive(true);
      console.log(
        "[BvhIdlePlayer] Initialization complete. Starting continuous idle loop."
      );
      updateStatus("Ready");
    } catch (error) {
      console.error(`[BvhIdlePlayer] Failed to load idle animation:`, error);
      updateStatus("Error loading idle animations.");
    }
  }

  // This is called by the mixer's 'finished' event listener
  private onActionFinished(event: any) {
    // For idle animations, we don't need to do anything since they loop continuously
    // This method is mainly for generated animations that play once
  }

  playNextIdleAnimation() {
    if (!this.isActive || this.actions.length === 0) return;

    // For idle, just play the first (and only) action continuously
    const idleAction = this.actions[0];
    console.log(
      `[BvhIdlePlayer] Starting continuous idle: ${idleAction.getClip().name}`
    );

    if (this.currentAction && this.currentAction.isRunning()) {
      this.currentAction.crossFadeTo(idleAction, 0.5, true);
    }

    idleAction.reset().fadeIn(0.5).play();
    this.currentAction = idleAction;
  }

  setActive(active: boolean) {
    if (this.isActive === active) return;
    this.isActive = active;

    if (active) {
      console.log("[BvhIdlePlayer] Activating continuous idle animation.");
      if (!this.currentAction || !this.currentAction.isRunning()) {
        this.playNextIdleAnimation();
      }
    } else {
      console.log(
        "[BvhIdlePlayer] Pausing idle animation for generated sequence."
      );
      if (this.currentAction) {
        this.currentAction.fadeOut(0.5);
      }
    }
  }
}

/**
 * Creates a special options object for retargeting from an A-Pose model to a T-Pose animation.
 * It does this by cloning the skeleton, forcing it into a T-Pose, and then using SkeletonUtils
 * to generate the necessary transform corrections.
 * @param {THREE.SkinnedMesh} targetMesh The character model's mesh.
 * @returns {object} A new options object for SkeletonUtils.retargetClip.
 */
interface RetargetOptions {
  hip: string;
  names: { [key: string]: string };
  bindTransforms: THREE.Matrix4[];
}

function createAtoTRetargetOptions(
  targetMesh: THREE.SkinnedMesh
): RetargetOptions {
  console.log("Creating retargeting options for RPM model...");

  // For RPM models, we don't need complex retargeting corrections
  // Just return the basic mapping options
  return {
    ...RPM_RETARGET_OPTIONS, // Copy your original hip and name mappings
    bindTransforms: [], // Provide an empty array
  };
}

const floorGeometry = new THREE.PlaneGeometry(10, 10); // 100x100 units
const textureLoader = new THREE.TextureLoader();
const floorTexture = textureLoader.load('grass.jpg');
floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(10, 10); // Adjust repetition as needed
const floorMaterial = new THREE.MeshBasicMaterial({ map: floorTexture });
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.9; // Slightly above ground to avoid z-fighting


const sky = new Sky();
sky.scale.setScalar(450000);


// Set parameters
const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 2;        // Less haze
skyUniforms['rayleigh'].value = 1;         // Less blue light scatter
skyUniforms['mieCoefficient'].value = 1;
skyUniforms['mieDirectionalG'].value = 1;
// Sun position
const sun = new THREE.Vector3();
sun.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 + 10), THREE.MathUtils.degToRad(180)); // below horizon
sky.material.uniforms['sunPosition'].value.copy(sun);


// NEW: CameraManager Class for dynamic camera control
// ===================================================================
class CameraManager {
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private targetGroup: THREE.Group | undefined;
  private followTargetBone: THREE.Bone | undefined;

  // --- ADD THE NEW MODE ---
  private mode: 'ORBIT' | 'FOLLOW' | 'TRANSITION_TO_ORBIT' = 'ORBIT';

  // --- ADD STATE SAVING VARIABLES ---
  private savedCameraPosition = new THREE.Vector3();
  private savedControlsTarget = new THREE.Vector3();

  // --- Configuration ---
  private followOffset = new THREE.Vector3(0, 2, 4.0);
  private lookAtOffset = new THREE.Vector3(0, 0.5, 0); // Tweaked for better view
  private dampingFactor = 0.05;

  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera;
    this.controls = controls;
  }

  public setTargetGroup(group: THREE.Group | undefined) {
    this.targetGroup = group;
  }
  
  public setFollowTargetBone(bone: THREE.Bone | undefined) {
    this.followTargetBone = bone;
  }

  public setMode(newMode: 'ORBIT' | 'FOLLOW') {
    if (this.mode === newMode) return;

    console.log(`[CameraManager] Switching from ${this.mode} to ${newMode}`);

    if (newMode === 'FOLLOW') {
      // Check if we have a valid target bone before switching
      if (!this.followTargetBone) {
        console.warn('[CameraManager] Cannot switch to FOLLOW mode: no target bone set');
        return;
      }
      
      // --- SAVE STATE BEFORE FOLLOWING ---
      this.savedCameraPosition.copy(this.camera.position);
      this.savedControlsTarget.copy(this.controls.target);

      this.mode = 'FOLLOW';
      this.controls.enabled = false;
      console.log('[CameraManager] Switched to FOLLOW mode, controls disabled');
    } else if (newMode === 'ORBIT') {
      // --- INITIATE THE TRANSITION BACK ---
      this.mode = 'TRANSITION_TO_ORBIT';
      this.controls.enabled = false; // Keep controls disabled during transition
      console.log('[CameraManager] Starting transition to ORBIT mode');
    }
  }

  public update() {
    if (this.mode === 'FOLLOW' && this.followTargetBone) {
      this.updateFollowCamera();
    } else if (this.mode === 'TRANSITION_TO_ORBIT') {
      // --- HANDLE THE TRANSITION LOGIC ---
      this.updateTransitionToOrbit();
    } else {
      // 'ORBIT' mode
      this.controls.update();
    }
  }

  private updateFollowCamera() {
    if (!this.followTargetBone || !this.targetGroup) return;
    
    const targetBonePosition = new THREE.Vector3();
    this.followTargetBone.getWorldPosition(targetBonePosition);

    const desiredCameraPosition = targetBonePosition.clone().add(this.followOffset);
    const desiredLookAtPoint = targetBonePosition.clone().add(this.lookAtOffset);

    this.camera.position.lerp(desiredCameraPosition, this.dampingFactor);
    this.controls.target.lerp(desiredLookAtPoint, this.dampingFactor);
    this.camera.lookAt(this.controls.target);
  }

  // --- NEW METHOD FOR TRANSITIONING BACK ---
  private updateTransitionToOrbit() {
    // Smoothly move camera and target back to where they were
    this.camera.position.lerp(this.savedCameraPosition, this.dampingFactor);
    this.controls.target.lerp(this.savedControlsTarget, this.dampingFactor);
    
    // Check if the transition is "close enough" to be considered finished
    const distanceToTargetPos = this.camera.position.distanceTo(this.savedCameraPosition);
    const distanceToTargetLook = this.controls.target.distanceTo(this.savedControlsTarget);
    
    if (distanceToTargetPos < 0.01 && distanceToTargetLook < 0.01) {
      // Transition is complete, snap to final position and switch mode
      this.camera.position.copy(this.savedCameraPosition);
      this.controls.target.copy(this.savedControlsTarget);
      
      this.mode = 'ORBIT';
      this.controls.enabled = true; // IMPORTANT: Re-enable user controls
      console.log("[CameraManager] Transition to Orbit complete. Controls enabled.");
    }
  }
}

const BACKEND_URL = "http://localhost:9093";

// --- Global variables ---
let scene: THREE.Scene;
let renderer: THREE.WebGLRenderer;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;
let mixer: THREE.AnimationMixer | undefined;
let bvhIdlePlayer: BvhIdlePlayer | undefined;
let correctedRetargetOptions: any | undefined;
let currentModel: THREE.Group | undefined;
let lastGeneratedFiles: string[] = [];
let headBone: THREE.Bone | undefined;
let originalCameraPosition: THREE.Vector3;
let originalCameraTarget: THREE.Vector3;
let originalModelScale: number;
let originalModelPosition: THREE.Vector3 | undefined;
let originalModelRotation: THREE.Euler | undefined;
// For smooth transition back to idle pose
let savedIdleWorldPosition: THREE.Vector3 | undefined;
let savedIdleWorldQuaternion: THREE.Quaternion | undefined;
let savedIdleWorldScale: THREE.Vector3 | undefined;
const clock = new THREE.Clock();
let currentEmotion = "neutral";

let cameraManager: CameraManager;

// --- ADD THESE FOR GAZE CONTROL ---
const mousePosition = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const intersectionPlane = new THREE.Plane();
const intersectionPoint = new THREE.Vector3();

// --- Mouse Gaze Delay Variables ---
let lastMouseUpdate = 0;
const mouseGazeDelay = 50; // 50ms delay before following mouse
let pendingMouseTarget: THREE.Vector2 | null = null;

// --- Natural Gaze Behavior Variables ---
let isTransitioningGaze = false;
let lastCameraGlanceTime = 0;
let nextCameraGlanceTime = 0;
const CAMERA_GLANCE_INTERVAL_MIN = 1000; // 8 seconds minimum
const CAMERA_GLANCE_INTERVAL_MAX = 8000; // 15 seconds maximum
const CAMERA_GLANCE_DURATION = 2000; // 2 seconds looking at camera
// --- END ADD ---

// --- DOM Elements ---
const characterGrid = document.getElementById("character-grid")!;
const characterNameEl = document.getElementById("character-name")!;
const characterSubtitleEl = document.getElementById("character-subtitle")!;
const talkInput = document.getElementById("talk-input") as HTMLInputElement;
const talkBtn = document.getElementById("talk-btn") as HTMLDivElement;
const motionInput = document.getElementById("motion-input") as HTMLInputElement;
const motionBtn = document.getElementById("motion-btn") as HTMLDivElement;
const loadingOverlay = document.getElementById("loading-overlay")!;
const debugBtn = document.getElementById("debug-btn") as HTMLDivElement;
const testTtsBtn = document.getElementById("test-tts-btn") as HTMLDivElement;
const statusIndicator = document.getElementById("status-indicator")!;
const loadingValue = document.getElementById("loading-value")!;
const emotionButtons = document.querySelectorAll(
  ".emotion-btn"
) as NodeListOf<HTMLDivElement>;

const chatBubble = document.getElementById("chat-bubble")!;
const chatText = document.getElementById("chat-text")!;
const typingIndicator = document.getElementById("typing-indicator")!;

function updateStatus(message: string) {
  if (statusIndicator) statusIndicator.textContent = message;
  if (loadingValue) loadingValue.textContent = message;
  console.log(`📊 Status: ${message}`);
}

function applyEmotion(emotion: string) {
  if (!vrmMeshes || vrmMeshes.length === 0 || !currentCharacter) {
    return;
  }
  const emotionMap = currentCharacter.morphs.emotions;

  // Reset ALL known emotional morphs for this character
  const allEmotionMorphs = new Set<string>();
  Object.values(emotionMap).forEach((emotionData) => {
    Object.keys(emotionData).forEach((morphName) =>
      allEmotionMorphs.add(morphName)
    );
  });

  vrmMeshes.forEach((mesh) => {
    const dict = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    if (dict && influences) {
      allEmotionMorphs.forEach((morphName) => {
        const index = dict[morphName];
        if (index !== undefined) influences[index] = 0;
      });
    }
  });

  // Apply new emotion
  const emotionData = emotionMap[emotion];
  if (emotionData) {
    vrmMeshes.forEach((mesh) => {
      if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        Object.entries(emotionData).forEach(([morphName, value]) => {
          const index = mesh.morphTargetDictionary![morphName];
          if (index !== undefined) {
            mesh.morphTargetInfluences![index] = value;
          }
        });
      }
    });
  }
  currentEmotion = emotion;
  updateEmotionButtons();
  console.log(`Applied emotion: ${emotion}`);
}

(window as any).applyEmotion = applyEmotion;

function updateEmotionButtons() {
  emotionButtons.forEach((button) => {
    const emotion = button.dataset.emotion;
    if (emotion === currentEmotion) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  });
}

function setupEmotionControls() {
  emotionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const emotion = button.dataset.emotion;
      if (emotion && !button.classList.contains("disabled")) {
        applyEmotion(emotion);
      }
    });
  });
  applyEmotion("neutral");
}

async function testTTSDirectly() {
  if (testTtsBtn.classList.contains("disabled")) return;
  const testText = "Hello, this is a direct TTS test.";
  testTtsBtn.classList.add("disabled");
  testTtsBtn.textContent = "Testing...";
  updateStatus("Testing TTS directly...");
  try {
    const askResponse = await fetch(`${BACKEND_URL}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: testText }),
    });
    if (askResponse.ok) {
      const askResult = await askResponse.json();
      if (askResult.audio_base64) {
        updateStatus("Playing direct TTS test...");
        await playAudioWithLipSync(askResult.audio_base64);
        updateStatus("Direct TTS test completed!");
      } else {
        updateStatus("TTS response missing audio_base64");
      }
    } else {
      updateStatus(`TTS failed: ${askResponse.status}`);
    }
  } catch (error) {
    updateStatus(`TTS error: ${error}`);
  } finally {
    testTtsBtn.classList.remove("disabled");
    testTtsBtn.textContent = "Test TTS";
    setTimeout(() => updateStatus("Ready"), 3000);
  }
}

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202020);
  scene.fog = new THREE.Fog(0x202020, 10, 50);
  camera = new THREE.PerspectiveCamera(
    35,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 2, 1.6);
  originalCameraPosition = camera.position.clone();
  originalCameraTarget = new THREE.Vector3(0, 1.2, 0);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 3);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(3, 10, 10);
  scene.add(dirLight);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  const avatarContainer = document.getElementById("avatar")!;
  avatarContainer.appendChild(renderer.domElement);
  const rect = avatarContainer.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, 0);
  controls.update();
  controls.enableZoom = true;
  controls.zoomSpeed = 0.2;
  controls.minDistance = 2;
  controls.maxDistance = 8;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  cameraManager = new CameraManager(camera, controls);

   window.addEventListener('mousemove', (event) => {
    // Store current time and mouse position
    const currentTime = Date.now();
    lastMouseUpdate = currentTime;
    
    // Store the pending normalized mouse coordinates
    const normalizedX = (event.clientX / window.innerWidth) * 2 - 1;
    const normalizedY = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Store the pending target for smooth transition after delay
    pendingMouseTarget = new THREE.Vector2(normalizedX, normalizedY);
    
    // Use debounced update for mouse gaze tracking
    setTimeout(() => {
      // Only update if no newer mouse movement has occurred
      if (lastMouseUpdate === currentTime && pendingMouseTarget) {
        // Don't snap instantly - the animation loop will smoothly interpolate
        // We just mark that we have a new target to move towards
        // The actual smooth movement happens in the animation loop
      }
    }, mouseGazeDelay);
  });

  window.addEventListener("resize", onWindowResize);

  window.addEventListener("resize", onWindowResize);
  talkBtn.addEventListener("click", handleTalkClick);
  motionBtn.addEventListener("click", handleMotionClick);
  debugBtn.addEventListener("click", () => rerun());
  testTtsBtn.addEventListener("click", testTTSDirectly);
  setupEmotionControls();
}

function createCharacterGrid() {
  characters.forEach((char, index) => {
    const card = document.createElement("div");
    card.className = "character-card";
    card.style.backgroundImage = `url(${char.portraitPath})`;
    card.dataset.index = index.toString();
    const nameEl = document.createElement("div");
    nameEl.className = "card-name";
    nameEl.innerText = char.name;
    card.appendChild(nameEl);
    card.addEventListener("click", () => selectCharacter(index));
    characterGrid.appendChild(card);
  });
}

async function selectCharacter(index: number) {
  currentCharacter = characters[index];
  if (!currentCharacter) return;

  document
    .querySelectorAll(".character-card")
    .forEach((card) => card.classList.remove("active"));
  const cardElement = characterGrid.querySelector(`[data-index="${index}"]`);
  cardElement?.classList.add("active");
  characterNameEl.textContent = currentCharacter.name;
  characterSubtitleEl.textContent = currentCharacter.subtitle;

  const availableEmotions = Object.keys(currentCharacter.morphs.emotions);
  emotionButtons.forEach((btn) => {
    const emotion = btn.dataset.emotion;
    if (emotion && !availableEmotions.includes(emotion)) {
      btn.classList.add("disabled");
    } else {
      btn.classList.remove("disabled");
    }
  });

  await loadCharacterModel(currentCharacter);
}

function playEmotionAfterTalking(emotion: string, durationMs: number = 1500) {
  applyEmotion(emotion);
  setTimeout(() => applyEmotion("neutral"), durationMs);
}

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
  }
  return audioContext;
}

async function playAudioWithLipSync(base64: string): Promise<void> {
  return new Promise(async (resolve) => {
    if (!lipSync) {
      resolve();
      return;
    }
    try {
      // Pre-talking: Look at camera briefly before starting to speak
      if (idleManager) {
        const cameraPosition = new THREE.Vector3();
        camera.getWorldPosition(cameraPosition);
        idleManager.setLookAtTarget(cameraPosition);
      }
      
      // Small delay to let the character look at camera before talking
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const audioData = atob(base64);
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      for (let i = 0; i < audioData.length; i++) {
        uint8Array[i] = audioData.charCodeAt(i);
      }
      const context = getAudioContext();
      if (context.state === "suspended") await context.resume();
      const audioBuffer = await context.decodeAudioData(arrayBuffer);
      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);
      lipSync.start();
      source.onended = () => {
        lipSync?.stop();
        // After talking, give a brief moment before returning to mouse tracking
        setTimeout(() => {
          // This delay allows for natural transition back to mouse gaze
        }, 500);
        resolve();
      };
      source.start(0);
    } catch (error) {
      console.error("Failed to play audio:", error);
      lipSync?.stop();
      resolve();
    }
  });
}


function handleStreamError(eventSource: EventSource, message: string = "Error with companion stream.") {
    console.error(message);
    eventSource.close();
    updateStatus(message);
    talkBtn.classList.remove("disabled");
    talkBtn.textContent = "Talk";
    lipSync?.stop();
    // Hide chat UI elements on error
    chatBubble.classList.add("hidden");
    typingIndicator.classList.add("hidden");
    setTimeout(() => updateStatus("Ready"), 3000);
}

async function getAndPlayAudio(text: string): Promise<void> {
    try {
        updateStatus("Getting speech audio...");
        const askResponse = await fetch(`${BACKEND_URL}/api/ask`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });
        if (askResponse.ok) {
            const { audio_base64 } = await askResponse.json();
            if (audio_base64) {
                await playAudioWithLipSync(audio_base64);
            }
        } else {
             console.warn("TTS generation failed:", askResponse.statusText);
             lipSync?.stop(); // Stop mumbling if TTS fails
        }
    } catch (error) {
        console.warn("TTS generation or playback failed:", error);
        lipSync?.stop(); // Stop mumbling if there's a network error
    }
  }

// --- NEW: Separate handlers for talk and motion ---
async function handleTalkClick() {
  if (talkBtn.classList.contains("disabled")) return;
  const prompt = talkInput.value.trim();
  if (!prompt) {
    alert("Please enter a prompt.");
    return;
  }
  
  talkBtn.classList.add("disabled");
  talkBtn.textContent = "Talking...";
  updateStatus("Talking to AI...");
  
  // Don't show chat bubble yet - wait until we get the first response token
  
  try {
    updateStatus("Asking companion AI...");
    const eventSource = new EventSource(`${BACKEND_URL}/api/companion_stream`);
    
    eventSource.onopen = () => {
      console.log("Connection to companion stream opened");
      // Send the prompt via POST to initiate the stream
      fetch(`${BACKEND_URL}/api/companion_stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: prompt }),
      }).catch(error => {
        console.error("Error sending prompt:", error);
        handleStreamError(eventSource, "Failed to send prompt");
      });
    };
    
    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'token') {
          // Show chat bubble on first token (if not already shown)
          if (chatBubble.classList.contains("hidden")) {
            chatBubble.classList.remove("hidden");
            chatText.textContent = "";
            typingIndicator.classList.remove("hidden");
          }
          // Hide typing indicator and start showing text
          typingIndicator.classList.add("hidden");
          chatText.textContent += data.content;
          chatBubble.scrollTop = chatBubble.scrollHeight;
        } else if (data.type === 'complete') {
          eventSource.close();
          const fullResponse = chatText.textContent;
          
          // Start TTS and lip sync (only if we have text)
          if (fullResponse) {
            await getAndPlayAudio(fullResponse);
          }
          
          // Play emotion after talking
          playEmotionAfterTalking("happy", 1500);
          updateStatus("Completed successfully!");
          
          // Hide chat bubble after a delay
          setTimeout(() => {
            chatBubble.classList.add("hidden");
          }, 3000);
          
          talkBtn.classList.remove("disabled");
          talkBtn.textContent = "Talk";
        } else if (data.type === 'error') {
          handleStreamError(eventSource, data.message || "Error from companion stream");
        }
      } catch (error) {
        console.error("Error parsing stream data:", error);
        handleStreamError(eventSource, "Error parsing response");
      }
    };
    
    eventSource.onerror = (error) => {
      console.error("EventSource error:", error);
      console.log("Falling back to regular companion API...");
      eventSource.close();
      
      // Fallback to regular API and show response in chat bubble
      fallbackToRegularAPI(prompt);
    };
    
  } catch (error) {
    console.error("Error during talk:", error);
    updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    chatBubble.classList.add("hidden");
    typingIndicator.classList.add("hidden");
    talkBtn.classList.remove("disabled");
    talkBtn.textContent = "Talk";
    setTimeout(() => updateStatus("Ready"), 3000);
  }
}

// Fallback function for when streaming is not available
async function fallbackToRegularAPI(prompt: string) {
  try {
    updateStatus("Using fallback API...");
    const companionResponse = await fetch(`${BACKEND_URL}/api/companion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: prompt }),
    });
    
    if (!companionResponse.ok) {
      throw new Error(`Companion API failed with status: ${companionResponse.status}`);
    }
    
    const { response: answer } = await companionResponse.json();
    if (!answer) throw new Error("Invalid response from companion");
    
    // Show chat bubble with the response
    chatBubble.classList.remove("hidden");
    chatText.textContent = "";
    typingIndicator.classList.add("hidden"); // Make sure typing indicator is hidden
    
    // Reveal text word by word for better UX
    await revealTextWordByWord(answer, chatText, 50);
    
    // Start TTS and lip sync
    await getAndPlayAudio(answer);
    
    // Play emotion after talking
    playEmotionAfterTalking("happy", 1500);
    updateStatus("Completed successfully!");
    
    // Hide chat bubble after a delay
    setTimeout(() => {
      chatBubble.classList.add("hidden");
    }, 3000);
    
  } catch (error) {
    console.error("Fallback API error:", error);
    updateStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    chatBubble.classList.add("hidden");
    typingIndicator.classList.add("hidden");
    setTimeout(() => updateStatus("Ready"), 3000);
  } finally {
    talkBtn.classList.remove("disabled");
    talkBtn.textContent = "Talk";
  }
}

function revealTextWordByWord(fullText: string, element: HTMLElement, speed: number = 80): Promise<void> {
    return new Promise(resolve => {
        const words = fullText.split(/( |\n)/); // Split by space or newline to preserve them
        let i = 0;
        element.textContent = "";
        const intervalId = setInterval(() => {
            if (i < words.length) {
                element.textContent += words[i];
                i++;
                chatBubble.scrollTop = chatBubble.scrollHeight;
            } else {
                clearInterval(intervalId);
                resolve(); // Signal that the animation is complete
            }
        }, speed); // Adjust speed (milliseconds per word)
    });
}


async function handleMotionClick() {
  if (motionBtn.classList.contains("disabled")) return;
  const prompt = motionInput.value.trim();
  if (!prompt) {
    alert("Please enter a prompt.");
    return;
  }
  if (idleManager) {
    idleManager.lookAtCamera(5000);
  }
  motionBtn.classList.add("disabled");
  motionBtn.textContent = "Generating...";
  updateStatus("Generating motion...");
  try {
    updateStatus("Asking companion AI...");
    const companionResponse = await fetch(`${BACKEND_URL}/api/companion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: prompt }),
    });
    if (!companionResponse.ok)
      throw new Error(
        `Companion API failed with status: ${companionResponse.status}`
      );
    const {
      action,
      keywords,
      response: answer,
    } = await companionResponse.json();
    if (!answer) throw new Error("Invalid response from companion");
    updateStatus("Getting speech audio...");
    let audioBase64 = null;
    try {
      const askResponse = await fetch(`${BACKEND_URL}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: answer }),
      });
      if (askResponse.ok) {
        audioBase64 = (await askResponse.json()).audio_base64;
      }
    } catch (error) {
      console.warn("TTS error:", error);
    }
    if (audioBase64) {
      // Show chat bubble with the AI response before playing audio
      chatBubble.classList.remove("hidden");
      chatText.textContent = answer;
      typingIndicator.classList.add("hidden"); // Make sure typing indicator is hidden
      
      updateStatus("Playing speech with lip sync...");
      await playAudioWithLipSync(audioBase64);
      
      // Hide chat bubble after speech is complete
      setTimeout(() => {
        chatBubble.classList.add("hidden");
      }, 2000); // 2 second delay after speech ends
    }
    if (action === "generate" && keywords && keywords.length > 0) {
      try {
        updateStatus("Generating motion animation...");
        const bvhResponse = await fetch(`${BACKEND_URL}/api/generate_bvh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompts: keywords }),
        });
        if (!bvhResponse.ok)
          throw new Error("Failed to generate motion animation");
        const generatedFiles = (await bvhResponse.json()).files_created || [];
        if (generatedFiles.length > 0) {
          updateStatus("Playing generated animation...");
          lastGeneratedFiles = generatedFiles;
          await playGeneratedSequence(generatedFiles);
        } else {
          updateStatus("No animation files generated");
        }
      } catch (motionError) {
        console.error("Motion generation error:", motionError);
        updateStatus("Motion generation failed.");
      }
    }
    updateStatus("Completed successfully!");
  } catch (error) {
    console.error("Error during motion generation:", error);
    updateStatus(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
    // Hide chat bubble on error
    chatBubble.classList.add("hidden");
  } finally {
    motionBtn.classList.remove("disabled");
    motionBtn.textContent = "Generate Motion";
    setTimeout(() => updateStatus("Ready"), 3000);
  }
}

async function rerun(filenames?: string[]) {
  if (debugBtn.classList.contains("disabled")) return;
  const filesToRerun = filenames || lastGeneratedFiles;
  if (!filesToRerun || filesToRerun.length === 0) {
    alert("No previous animation to rerun.");
    return;
  }
  debugBtn.classList.add("disabled");
  debugBtn.textContent = "Rerunning...";
  try {
    await playGeneratedSequence(filesToRerun);
  } catch (error) {
    console.error("Error during rerun:", error);
  } finally {
    debugBtn.classList.remove("disabled");
    debugBtn.textContent = "Rerun Last";
  }
}

function onWindowResize() {
  const avatarContainer = document.getElementById("avatar")!;
  const rect = avatarContainer.getBoundingClientRect();
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  renderer.setSize(rect.width, rect.height);
}

// --- SIMPLIFIED: Core logic for loading an RPM character ---
async function loadCharacterModel(character: CharacterData) {
  // Clean up previous model
  if (currentModel) scene.remove(currentModel);
  if (mixer) mixer.stopAllAction();

  mixer = undefined;
  bvhIdlePlayer = undefined;
  correctedRetargetOptions = undefined; // Reset the options
  vrmMeshes = [];
  idleBlinker = undefined;
  lipSync = undefined;
  idleManager = undefined;

  updateStatus(`Loading ${character.name}...`);
  const gltfLoader = new GLTFLoader();
  const targetGltf = await gltfLoader.loadAsync(character.gltfPath);
  updateStatus("Initializing...");

  currentModel = targetGltf.scene;
  originalModelScale = character.scale || 1.0;
  // Set scale, position and rotation
  currentModel.scale.setScalar(originalModelScale);
  currentModel.position.set(0, -0.5, 0);
  if (character.rotation) {
    currentModel.rotation.set(...character.rotation);
  }
  // Save original position and rotation for later restoration
  originalModelPosition = currentModel.position.clone();
  originalModelRotation = currentModel.rotation.clone();
  // --- HIDE MODEL INITIALLY TO PREVENT T-POSE FLASH ---
  currentModel.visible = false;
  scene.add(currentModel);
  cameraManager.setTargetGroup(currentModel);
  let hipsBone: THREE.Bone | undefined;
  currentModel.traverse((object) => {
    if (object instanceof THREE.Bone && object.name === 'Hips') {
      hipsBone = object;
    }
  });

  if (hipsBone) {
    console.log('[CameraManager] Hips bone found. Follow camera enabled.');
    cameraManager.setFollowTargetBone(hipsBone);
  } else {
    console.warn('[CameraManager] "Hips" bone not found. Follow camera may not work correctly.');
    cameraManager.setFollowTargetBone(undefined); // Ensure it's cleared if not found
  }
  // --- START OF NEW CODE ---
  // Find and store a reference to the head bone for post-animation adjustments
  currentModel.traverse((object) => {
    if (object instanceof THREE.Bone && object.name === character.bones.head) {
      console.log(`Found head bone: '${object.name}'`);
      headBone = object;
    }
  });

  if (!headBone) {
    console.warn(
      `Could not find the specified head bone: '${character.bones.head}'`
    );
  }
  // Find all SkinnedMesh objects for morph targets
  currentModel.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) {
      vrmMeshes.push(object);
      // Debug: Log available morph targets
      if (object.morphTargetDictionary) {
        console.log(
          `%c--- Morph Targets Available in ${
            object.name || "SkinnedMesh"
          }: ---`,
          "color: #00ff00; font-weight: bold;"
        );
        console.log(Object.keys(object.morphTargetDictionary));
        console.log(
          "%c--- End Morph Targets ---",
          "color: #00ff00; font-weight: bold;"
        );
      } else {
        console.warn(
          `No morph targets found in ${object.name || "SkinnedMesh"}`
        );
      }
    }
  });

  // Initialize morph-based systems
  if (vrmMeshes.length > 0) {
    console.log(`Found ${vrmMeshes.length} SkinnedMesh(es) for morph targets`);
    idleBlinker = new IdleBlinker(vrmMeshes, character.morphs);
    lipSync = new LipSync(vrmMeshes, character.morphs);
    console.log("Lip sync and blinker initialized successfully");
  } else {
    console.error(
      "No SkinnedMesh objects found - lip sync and blinking will not work"
    );
  }

  const targetSkinnedMesh = currentModel.getObjectByProperty(
    "isSkinnedMesh",
    true
  ) as THREE.SkinnedMesh;
  if (!targetSkinnedMesh) {
    console.error("Model does not contain a SkinnedMesh.");
    return;
  }

  // Create retargeting options
  correctedRetargetOptions = createAtoTRetargetOptions(targetSkinnedMesh);

  mixer = new THREE.AnimationMixer(targetSkinnedMesh);

  // Only use Helloidle.bvh for continuous idle animation
  const IDLE_ANIMATIONS = ["Helloidle.bvh"];
  // Pass the corrected options to the idle player
  bvhIdlePlayer = new BvhIdlePlayer(
    mixer,
    targetSkinnedMesh,
    IDLE_ANIMATIONS,
    correctedRetargetOptions
  );
  await bvhIdlePlayer.initialize();

  console.log("Setting up RPM procedural head/eye movement.");
  idleManager = new IdleManager(currentModel, camera, character.bones);
  idleManager.setActive(true);

  // --- SHOW MODEL ONLY AFTER IDLE ANIMATION IS READY ---
  currentModel.visible = true;

  applyEmotion("neutral");
  updateStatus("Ready");
}

// --- SIMPLIFIED: Plays generated BVH files on an RPM model ---
async function playGeneratedSequence(filenames: string[]) {
  if (!mixer || !currentModel) return;
  const targetSkinnedMesh = currentModel.getObjectByProperty(
    "isSkinnedMesh",
    true
  ) as THREE.SkinnedMesh;
  if (!targetSkinnedMesh) return;

  loadingOverlay.classList.add("visible");

  // --- HIDE MODEL TO PREVENT T-POSE FLASH ---
  currentModel.visible = false;

  cameraManager.setMode('FOLLOW');
  // --- MODIFICATION: PAUSE BOTH IDLE SYSTEMS ---
  if (idleManager) idleManager.setActive(false);
  if (bvhIdlePlayer) bvhIdlePlayer.setActive(false); // Pause the new BVH idle player

  // Save the model's world transform before BVH animation
  if (currentModel) {
    currentModel.updateMatrixWorld(true);
    savedIdleWorldPosition = new THREE.Vector3();
    savedIdleWorldQuaternion = new THREE.Quaternion();
    savedIdleWorldScale = new THREE.Vector3();
    currentModel.matrixWorld.decompose(
      savedIdleWorldPosition,
      savedIdleWorldQuaternion,
      savedIdleWorldScale
    );
  }

  // Instantly reset model to original idle transform (no skeleton.pose)
  async function resetToIdleTransform() {
    // Remove current model and reload character from scratch
    if (currentModel) scene.remove(currentModel);
    mixer = undefined;
    bvhIdlePlayer = undefined;
    correctedRetargetOptions = undefined;
    vrmMeshes = [];
    idleBlinker = undefined;
    lipSync = undefined;
    idleManager = undefined;
    // Reload the current character (will restore idle)
    if (currentCharacter) await loadCharacterModel(currentCharacter);
    // --- ENSURE MODEL IS VISIBLE AFTER RELOAD ---
    if (currentModel) currentModel.visible = true;
  }

  mixer.stopAllAction();
  targetSkinnedMesh.skeleton.pose(); // This resets the skeleton to A-Pose.

  const bvhLoader = new BVHLoader();
  let clips: any[];
  try {
    clips = await Promise.all(
      filenames.map((filename) =>
        bvhLoader.loadAsync(`${BACKEND_URL}/generated_bvh/${filename}`)
      )
    );
  } catch (error) {
    console.error("Failed to load generated BVH files:", error);
    // --- MODIFICATION: RESUME IDLE ON FAILURE ---
    if (bvhIdlePlayer) bvhIdlePlayer.setActive(true);
    if (idleManager) idleManager.setActive(true);
    loadingOverlay.classList.remove("visible");
    // --- SHOW MODEL AGAIN ON FAILURE ---
    if (currentModel) currentModel.visible = true;
    cameraManager.setMode('ORBIT');
    return;
  }

  if (clips.length > 0) {
    console.log(
      "%c--- BVH Animation Bones (for Retargeting) ---",
      "color: #007bff; font-weight: bold;"
    );
    console.log(clips[0].skeleton.bones.map((b: THREE.Bone) => b.name));
    console.log(
      "%c-------------------------------------------",
      "color: #007bff; font-weight: bold;"
    );
  }

  const sequenceActions = clips.map((bvh) => {
    const retargetedClip = SkeletonUtils.retargetClip(
      targetSkinnedMesh,
      bvh.skeleton,
      bvh.clip,
      correctedRetargetOptions
    );
    const action = mixer!.clipAction(retargetedClip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    return action;
  });

  if (sequenceActions.length === 0) {
    console.error("Failed to retarget generated sequence.");
    // --- MODIFICATION: RESUME IDLE ON FAILURE ---
    if (bvhIdlePlayer) bvhIdlePlayer.setActive(true);
    if (idleManager) idleManager.setActive(true);
    loadingOverlay.classList.remove("visible");
    // --- SHOW MODEL AGAIN ON FAILURE ---
    if (currentModel) currentModel.visible = true;
    cameraManager.setMode('ORBIT');
    return;
  }

  let currentActionIndex = 0;

  // Make the event handler async to allow await inside
  const onActionFinished = async (event: any) => {
    // Important: This listener should ONLY react to the actions from this sequence.
    if (!sequenceActions.includes(event.action)) return;
    if (event.action !== sequenceActions[currentActionIndex]) return;

    currentActionIndex++;

    if (currentActionIndex < sequenceActions.length) {
      const lastAction = sequenceActions[currentActionIndex - 1];
      const nextAction = sequenceActions[currentActionIndex];
      lastAction.crossFadeTo(nextAction, 0.3, true);
      nextAction.play();
    } else {
       mixer?.removeEventListener('finished', onActionFinished);
      loadingOverlay.classList.remove("visible");

      // Instantly reset to idle pose
      await resetToIdleTransform();
      
      // Tell the camera to start its smooth transition back to orbit mode
      cameraManager.setMode('ORBIT'); 
      
      // Resume the idle systems
      if (bvhIdlePlayer) {
        bvhIdlePlayer.setActive(true);
        console.log("Generated sequence finished. Resuming BVH idle.");
      }
      if (idleManager) {
        idleManager.setActive(true);
      }
    }
  };

  // --- SHOW MODEL AS SOON AS ANIMATION STARTS ---
  if (currentModel) currentModel.visible = true;
  sequenceActions[0].play();
  mixer.addEventListener("finished", onActionFinished);
  setTimeout(() => loadingOverlay.classList.remove("visible"), 100);
}

// --- SIMPLIFIED: The main animation loop ---
// --- SIMPLIFIED: The main animation loop ---
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // --- SMOOTH MOUSE INTERPOLATION ---
  // Smoothly interpolate mousePosition towards pendingMouseTarget after delay
  if (pendingMouseTarget && (Date.now() - lastMouseUpdate) >= mouseGazeDelay) {
    // Smooth interpolation to the pending target
    const lerpFactor = Math.min(delta * 3.0, 1.0); // Adjust 3.0 for smoothness (lower = smoother)
    mousePosition.lerp(pendingMouseTarget, lerpFactor);
    
    // Clear pending target when we're close enough
    if (mousePosition.distanceTo(pendingMouseTarget) < 0.01) {
      pendingMouseTarget = null;
    }
  }

  // --- GAZE CONTROL LOGIC ---
  const currentTime = performance.now();
  
  // Initialize next camera glance time if not set
  if (nextCameraGlanceTime === 0) {
    nextCameraGlanceTime = currentTime + Math.random() * (CAMERA_GLANCE_INTERVAL_MAX - CAMERA_GLANCE_INTERVAL_MIN) + CAMERA_GLANCE_INTERVAL_MIN;
  }
  
  // Check if character is talking - if so, look at camera
  if (lipSync?.isTalking()) {
    // During talking, character should look at the camera (user)
    if (idleManager) {
      const cameraPosition = new THREE.Vector3();
      camera.getWorldPosition(cameraPosition);
      idleManager.setLookAtTarget(cameraPosition);
      isTransitioningGaze = false; // Clear any transition state
    }
  } else {
    // When not talking, check for natural camera glances or follow mouse
    const shouldGlanceAtCamera = currentTime >= nextCameraGlanceTime && 
                                 currentTime < (nextCameraGlanceTime + CAMERA_GLANCE_DURATION);
    
    if (shouldGlanceAtCamera) {
      // Natural camera glance during idle time
      if (idleManager) {
        const cameraPosition = new THREE.Vector3();
        camera.getWorldPosition(cameraPosition);
        idleManager.setLookAtTarget(cameraPosition);
      }
      
      // Schedule next camera glance
      if (currentTime >= (nextCameraGlanceTime + CAMERA_GLANCE_DURATION)) {
        nextCameraGlanceTime = currentTime + Math.random() * (CAMERA_GLANCE_INTERVAL_MAX - CAMERA_GLANCE_INTERVAL_MIN) + CAMERA_GLANCE_INTERVAL_MIN;
      }
    } else {
      // Follow mouse gaze as normal
      // 1. Update the intersection plane to be in front of the character, facing the camera.
      // This plane acts as a "virtual screen" for the mouse to interact with.
      if (currentModel) {
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        // Position the plane at the character's location
        const modelPosition = new THREE.Vector3();
        currentModel.getWorldPosition(modelPosition);
        intersectionPlane.setFromNormalAndCoplanarPoint(cameraDirection, modelPosition);
      }

      // 2. Cast a ray from the camera through the normalized mouse position.
      raycaster.setFromCamera(mousePosition, camera);

      // 3. Find where the ray intersects our virtual screen.
      raycaster.ray.intersectPlane(intersectionPlane, intersectionPoint);

      // 4. Feed this 3D intersection point to the IdleManager.
      // The IdleManager will decide whether to use it or perform its random idle movements.
      if (idleManager) {
        idleManager.setLookAtTarget(intersectionPoint);
      }
    }
  }
  // --- END OF GAZE CONTROL LOGIC ---

  // Update all the core animation systems
  if (mixer) mixer.update(delta);
  if (idleBlinker) idleBlinker.update(performance.now());
  if (idleManager) idleManager.update(delta); // This now handles gaze OR idle

  // Ensure model scale is correct (can be useful if animations affect it)
  if (currentModel && originalModelScale) {
    currentModel.scale.setScalar(originalModelScale);
  }

  // Update the camera (handles orbit, follow, and transitions)
  cameraManager.update();

  // Render the final scene
  renderer.render(scene, camera);
}

async function main() {
  init();
  createCharacterGrid();
  await selectCharacter(0); // Load the first character by default]    
  scene.add(sky);
  scene.add(floor);
  animate();
}

main();

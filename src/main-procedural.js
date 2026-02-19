import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Global variables
let scene, camera, renderer, controls;
let avatar = {};
let mixer = null;
let clock = new THREE.Clock();

// State
let isSpeaking = false;
let speakingStartTime = 0;
let currentExpression = 'neutral';

// DOM elements
const loadingEl = document.getElementById('loading');
const messageDisplayEl = document.getElementById('message-display');
const micStatusEl = document.getElementById('mic-status');
const agentStatusEl = document.getElementById('agent-status');
const connectionStatusEl = document.getElementById('connection-status');

// Materials
const skinMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffdbac,
    roughness: 0.3,
    metalness: 0.1
});

const suitMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x2563eb,
    roughness: 0.5,
    metalness: 0.2
});

const shirtMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffffff,
    roughness: 0.6
});

const hairMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x1f2937,
    roughness: 0.8
});

const eyeMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x1f2937,
    roughness: 0.1
});

// Initialize the scene
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 8, 25);

    // Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.6, 4);
    camera.lookAt(0, 1.2, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(3, 8, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x4a90e2, 0.5);
    rimLight.position.set(-3, 5, -5);
    scene.add(rimLight);

    // Ground
    const groundGeometry = new THREE.CircleGeometry(8, 32);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x0a0a1a,
        roughness: 0.8,
        metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2.5;
    controls.maxDistance = 6;
    controls.target.set(0, 1.2, 0);
    controls.enablePan = false;

    // Create procedural avatar
    createProceduralAvatar();

    // WebSocket
    connectWebSocket();

    // Start loop
    animate();

    // Resize handler
    window.addEventListener('resize', onWindowResize);

    // Hide loading
    loadingEl.style.display = 'none';
    agentStatusEl.classList.add('active');
}

// Create procedural humanoid avatar
function createProceduralAvatar() {
    const avatarGroup = new THREE.Group();

    // Head group (for animation)
    avatar.head = new THREE.Group();
    avatar.head.position.set(0, 1.55, 0);
    
    // Face
    const faceGeo = new THREE.SphereGeometry(0.11, 32, 32);
    const face = new THREE.Mesh(faceGeo, skinMaterial);
    face.castShadow = true;
    avatar.head.add(face);

    // Hair
    const hairGeo = new THREE.SphereGeometry(0.115, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.4);
    const hair = new THREE.Mesh(hairGeo, hairMaterial);
    hair.rotation.x = Math.PI;
    hair.position.y = 0.01;
    avatar.head.add(hair);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.018, 16, 16);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMaterial);
    leftEye.position.set(-0.04, 0.01, 0.09);
    avatar.head.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeo, eyeMaterial);
    rightEye.position.set(0.04, 0.01, 0.09);
    avatar.head.add(rightEye);

    // Mouth (for lip sync)
    const mouthGeo = new THREE.CapsuleGeometry(0.015, 0.03, 4, 8);
    const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0xcc8888 });
    avatar.mouth = new THREE.Mesh(mouthGeo, mouthMaterial);
    avatar.mouth.position.set(0, -0.05, 0.095);
    avatar.mouth.rotation.z = Math.PI / 2;
    avatar.mouth.scale.set(1, 0.3, 0.5);
    avatar.head.add(avatar.mouth);

    avatarGroup.add(avatar.head);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 16);
    const neck = new THREE.Mesh(neckGeo, skinMaterial);
    neck.position.set(0, 1.45, 0);
    neck.castShadow = true;
    avatarGroup.add(neck);

    // Torso
    avatar.torso = new THREE.Group();
    avatar.torso.position.set(0, 1.1, 0);

    // Upper body (suit)
    const chestGeo = new THREE.CylinderGeometry(0.18, 0.16, 0.35, 16);
    const chest = new THREE.Mesh(chestGeo, suitMaterial);
    chest.position.y = 0.15;
    chest.castShadow = true;
    avatar.torso.add(chest);

    // Shirt (white triangle)
    const shirtGeo = new THREE.ConeGeometry(0.08, 0.2, 3);
    const shirt = new THREE.Mesh(shirtGeo, shirtMaterial);
    shirt.position.set(0, 0.15, 0.12);
    shirt.rotation.x = -0.2;
    avatar.torso.add(shirt);

    // Lower body
    const hipsGeo = new THREE.CylinderGeometry(0.16, 0.14, 0.3, 16);
    const hips = new THREE.Mesh(hipsGeo, suitMaterial);
    hips.position.y = -0.15;
    hips.castShadow = true;
    avatar.torso.add(hips);

    avatarGroup.add(avatar.torso);

    // Arms
    function createArm(isLeft) {
        const armGroup = new THREE.Group();
        const side = isLeft ? -1 : 1;
        armGroup.position.set(side * 0.22, 1.35, 0);

        // Upper arm
        const upperArmGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.35, 12);
        const upperArm = new THREE.Mesh(upperArmGeo, suitMaterial);
        upperArm.position.y = -0.175;
        upperArm.castShadow = true;
        armGroup.add(upperArm);

        // Lower arm
        const lowerArmGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.3, 12);
        const lowerArm = new THREE.Mesh(lowerArmGeo, skinMaterial);
        lowerArm.position.y = -0.55;
        lowerArm.castShadow = true;
        armGroup.add(lowerArm);

        // Hand
        const handGeo = new THREE.SphereGeometry(0.035, 12, 12);
        const hand = new THREE.Mesh(handGeo, skinMaterial);
        hand.position.y = -0.73;
        armGroup.add(hand);

        return armGroup;
    }

    avatar.leftArm = createArm(true);
    avatar.rightArm = createArm(false);
    avatarGroup.add(avatar.leftArm);
    avatarGroup.add(avatar.rightArm);

    // Legs
    function createLeg(isLeft) {
        const legGroup = new THREE.Group();
        const side = isLeft ? -1 : 1;
        legGroup.position.set(side * 0.08, 0.8, 0);

        // Thigh
        const thighGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.45, 12);
        const thigh = new THREE.Mesh(thighGeo, suitMaterial);
        thigh.position.y = -0.225;
        thigh.castShadow = true;
        legGroup.add(thigh);

        // Shin
        const shinGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.45, 12);
        const shin = new THREE.Mesh(shinGeo, suitMaterial);
        shin.position.y = -0.675;
        shin.castShadow = true;
        legGroup.add(shin);

        // Foot
        const footGeo = new THREE.BoxGeometry(0.08, 0.05, 0.15);
        const foot = new THREE.Mesh(footGeo, suitMaterial);
        foot.position.set(0, -0.925, 0.04);
        foot.castShadow = true;
        legGroup.add(foot);

        return legGroup;
    }

    avatar.leftLeg = createLeg(true);
    avatar.rightLeg = createLeg(false);
    avatarGroup.add(avatar.leftLeg);
    avatarGroup.add(avatar.rightLeg);

    scene.add(avatarGroup);
    
    console.log('✅ Procedural avatar created');
}

// Lip sync animation
function updateLipSync(deltaTime) {
    if (!isSpeaking || !avatar.mouth) return;
    
    const elapsed = (Date.now() - speakingStartTime) / 1000;
    
    // Mouth movement based on sine wave
    const openness = (Math.sin(elapsed * 15) + 1) / 2 * 0.8 + 0.2;
    avatar.mouth.scale.y = 0.3 + openness * 0.7;
    
    // Head slight movement while speaking
    if (avatar.head) {
        avatar.head.rotation.y = Math.sin(elapsed * 2) * 0.05;
        avatar.head.rotation.x = Math.sin(elapsed * 3) * 0.02;
    }
}

// Idle animation
function updateIdleAnimation(time) {
    if (!avatar.torso) return;
    
    // Breathing
    const breathScale = 1 + Math.sin(time * 2) * 0.015;
    avatar.torso.scale.set(breathScale, breathScale, breathScale);
    
    // Subtle arm sway
    if (avatar.leftArm && avatar.rightArm) {
        avatar.leftArm.rotation.z = 0.1 + Math.sin(time * 1.5) * 0.03;
        avatar.rightArm.rotation.z = -0.1 - Math.sin(time * 1.5 + 1) * 0.03;
    }
    
    // Reset mouth when not speaking
    if (!isSpeaking && avatar.mouth) {
        avatar.mouth.scale.y = 0.3;
    }
    
    // Blink
    if (Math.random() < 0.005) {
        blink();
    }
}

// Blink animation
function blink() {
    if (!avatar.head) return;
    
    const eyes = avatar.head.children.filter(child => 
        child.geometry && child.geometry.type === 'SphereGeometry' && 
        child.material === eyeMaterial
    );
    
    eyes.forEach(eye => {
        const originalScale = eye.scale.y;
        eye.scale.y = 0.1;
        setTimeout(() => {
            eye.scale.y = originalScale;
        }, 150);
    });
}

// WebSocket connection
function connectWebSocket() {
    const wsUrl = 'ws://127.0.0.1:18790';
    
    try {
        const ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('✅ Connected to Voice Gateway');
            connectionStatusEl.classList.add('active');
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            handleVoiceGatewayMessage(data);
        };
        
        ws.onclose = () => {
            console.log('❌ Disconnected from Voice Gateway');
            connectionStatusEl.classList.remove('active');
            setTimeout(connectWebSocket, 5000);
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    } catch (e) {
        console.log('WebSocket not available, running in standalone mode');
    }
}

// Handle messages
function handleVoiceGatewayMessage(data) {
    switch(data.type) {
        case 'speaking_start':
            isSpeaking = true;
            speakingStartTime = Date.now();
            agentStatusEl.classList.add('speaking');
            showMessage(data.text || 'Speaking...');
            break;
            
        case 'speaking_end':
            isSpeaking = false;
            agentStatusEl.classList.remove('speaking');
            hideMessage();
            break;
            
        case 'listening':
            micStatusEl.classList.add('recording');
            agentStatusEl.classList.remove('speaking');
            showMessage('Listening...');
            break;
            
        case 'mic_off':
            micStatusEl.classList.remove('recording');
            break;
    }
}

function showMessage(text) {
    messageDisplayEl.textContent = text;
    messageDisplayEl.classList.add('show');
}

function hideMessage() {
    messageDisplayEl.classList.remove('show');
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    const deltaTime = clock.getDelta();
    
    controls.update();
    
    if (isSpeaking) {
        updateLipSync(deltaTime);
    } else {
        updateIdleAnimation(time);
    }
    
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Initialize
init();

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Global variables
let scene, camera, renderer, controls;
let currentVrm = null;
let mixer = null;
let clock = new THREE.Clock();

// Lip sync and expression state
let currentExpression = 'neutral';
let isSpeaking = false;
let speakingStartTime = 0;

// WebSocket connection
let ws = null;
let reconnectInterval = 5000;

// DOM elements
const loadingEl = document.getElementById('loading');
const messageDisplayEl = document.getElementById('message-display');
const micStatusEl = document.getElementById('mic-status');
const agentStatusEl = document.getElementById('agent-status');
const connectionStatusEl = document.getElementById('connection-status');

// Initialize the scene
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 10, 50);

    // Camera setup
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.4, 3.5);
    camera.lookAt(0, 1.2, 0);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x4a90e2, 0.4);
    backLight.position.set(-5, 5, -5);
    scene.add(backLight);

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
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
    controls.minDistance = 2;
    controls.maxDistance = 5;
    controls.target.set(0, 1.2, 0);

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Load VRM model
    loadVRMModel();

    // Connect to Voice Gateway
    connectWebSocket();

    // Start animation loop
    animate();
}

// Load VRM model
function loadVRMModel() {
    const loader = new GLTFLoader();
    
    // Try to load the VRM model
    loader.load(
        '/models/avatar.vrm',
        (gltf) => {
            const vrm = gltf.userData.vrm;
            
            if (vrm) {
                currentVrm = vrm;
                scene.add(vrm.scene);
                
                // Setup VRM
                vrm.scene.traverse((obj) => {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                });

                // Adjust position
                vrm.scene.position.set(0, 0, 0);
                vrm.scene.rotation.y = 0;

                // Hide loading
                loadingEl.style.display = 'none';
                
                // Update status
                agentStatusEl.classList.add('active');
                
                console.log('✅ VRM model loaded');
            }
        },
        (progress) => {
            console.log('Loading VRM:', (progress.loaded / progress.total * 100) + '%');
        },
        (error) => {
            console.error('❌ Failed to load VRM:', error);
            // Create a placeholder avatar
            createPlaceholderAvatar();
        }
    );
}

// Create placeholder avatar if VRM fails to load
function createPlaceholderAvatar() {
    const group = new THREE.Group();

    // Head
    const headGeometry = new THREE.SphereGeometry(0.15, 32, 32);
    const headMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffdbac,
        roughness: 0.3
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.6;
    head.castShadow = true;
    group.add(head);

    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.02, 16, 16);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.05, 1.62, 0.13);
    group.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.05, 1.62, 0.13);
    group.add(rightEye);

    // Body
    const bodyGeometry = new THREE.CylinderGeometry(0.2, 0.25, 0.8, 32);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x3b82f6,
        roughness: 0.5
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 1.0;
    body.castShadow = true;
    group.add(body);

    scene.add(group);
    
    // Hide loading
    loadingEl.style.display = 'none';
    agentStatusEl.classList.add('active');
    
    console.log('✅ Placeholder avatar created');
}

// WebSocket connection to Voice Gateway
function connectWebSocket() {
    const wsUrl = 'ws://127.0.0.1:18790'; // Voice Gateway WebSocket port
    
    ws = new WebSocket(wsUrl);
    
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
        
        // Reconnect
        setTimeout(connectWebSocket, reconnectInterval);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// Handle messages from Voice Gateway
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
            
        case 'thinking':
            micStatusEl.classList.remove('recording');
            agentStatusEl.classList.remove('speaking');
            showMessage('Thinking...');
            break;
            
        case 'message':
            showMessage(data.text);
            break;
            
        case 'mic_off':
            micStatusEl.classList.remove('recording');
            break;
    }
}

// Show message on display
function showMessage(text) {
    messageDisplayEl.textContent = text;
    messageDisplayEl.classList.add('show');
}

// Hide message
function hideMessage() {
    messageDisplayEl.classList.remove('show');
}

// Lip sync animation
function updateLipSync(deltaTime) {
    if (!currentVrm || !isSpeaking) return;
    
    const elapsed = (Date.now() - speakingStartTime) / 1000;
    
    // Simple mouth animation using blend shapes
    // In a real implementation, this would sync with TTS audio
    const mouthOpenness = (Math.sin(elapsed * 10) + 1) / 2 * 0.5;
    
    // Apply to VRM blend shapes if available
    if (currentVrm.expressionManager) {
        currentVrm.expressionManager.setValue('aa', mouthOpenness);
    }
}

// Idle animation
function updateIdleAnimation(deltaTime) {
    if (!currentVrm) return;
    
    // Breathing animation
    const time = Date.now() / 1000;
    const breathScale = 1 + Math.sin(time * 2) * 0.02;
    
    if (currentVrm.humanoid) {
        const chest = currentVrm.humanoid.getNormalizedBoneNode('chest');
        if (chest) {
            chest.scale.setScalar(breathScale);
        }
    }
    
    // Blink
    if (Math.random() < 0.005) {
        blink();
    }
}

// Blink animation
function blink() {
    if (!currentVrm || !currentVrm.expressionManager) return;
    
    const duration = 150;
    const startTime = Date.now();
    
    const blinkInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;
        
        if (progress >= 1) {
            currentVrm.expressionManager.setValue('blink', 0);
            clearInterval(blinkInterval);
        } else {
            const value = Math.sin(progress * Math.PI);
            currentVrm.expressionManager.setValue('blink', value);
        }
    }, 16);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = clock.getDelta();
    
    // Update controls
    controls.update();
    
    // Update animations
    if (isSpeaking) {
        updateLipSync(deltaTime);
    } else {
        updateIdleAnimation(deltaTime);
    }
    
    // Update VRM
    if (currentVrm) {
        currentVrm.update(deltaTime);
    }
    
    // Render
    renderer.render(scene, camera);
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start
init();

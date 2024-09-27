import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Renderer } from "@k8slens/extensions";
import { Card, CardContent, Typography, Box, Divider, List, ListItem, ListItemText } from '@mui/material';
import gsap from "gsap";
import CameraswitchIcon from '@mui/icons-material/Cameraswitch'; 

// Define the props interface
interface ThreeJsVisualizationPageProps {
  extension: Renderer.LensExtension;
}

// Define the Node and Pod structure
interface NodeData {
  name: string;
  pods: PodData[];
  status: string;
  roles: string[];
  internalIP?: string;
  externalIP?: string;
  kubeletVersion?: string;
  operatingSystem?: string;
  kernelVersion?: string;
  containerRuntimeVersion?: string;
  conditions: {                       
    type: string;
    status: string;
    reason?: string;
    message?: string;
    lastTransitionTime?: string;
  }[];
  capacity?: { // Optional
    cpu?: string;
    memory?: string;
  }; 
  allocatable?: { // Optional
    cpu?: string;
    memory?: string;
    ephemeralStorage?: string;
  };
  labels: { [key: string]: string };
  annotations: { [key: string]: string };
}

interface PodData {
  name: string;
  status: string;
  podIP?: string; 
  nodeName?: string;
  startTime?: string;
  qosClass?: string; 
  restartCount?: number;
  containers: ContainerData[];
}

interface ContainerData {
  name: string;
  image: string;
  cpuRequest?: string;
  memoryRequest?: string;
  cpuLimit?: string;
  memoryLimit?: string;
  restartCount?: number;
}

// --- Variables to keep track of blinking Node and Pod ---
let currentBlinkingNode: THREE.Mesh | null = null;
let currentBlinkingPod: THREE.Mesh | null = null;
let currentLabelSprite: THREE.Sprite | null = null;

// Manage timer for end of scroll
let scrollTimeout: NodeJS.Timeout | null = null;

export const ThreeJsVisualizationPage: React.FC<ThreeJsVisualizationPageProps> = ({ extension }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Stores for Kubernetes objects
  const podStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.podsApi) as Renderer.K8sApi.PodsStore;
  const nodeStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.nodesApi) as Renderer.K8sApi.NodesStore;

  const [splitSize, setSplitSize] = useState<number>(80); // Use number instead of string for easier calculations
  const [isDragging, setIsDragging] = useState(false);  // Track dragging state

  // useState to store fixed node data
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [selectedPod, setSelectedPod] = useState<PodData | null>(null);

  useEffect(() => {
    const loadData = async () => {
      await nodeStore.loadAll(); // Load all nodes
      await podStore.loadAll();  // Load all pods
    
      const fixedNodes: NodeData[] = nodeStore.items.map((node: Renderer.K8sApi.Node) => {
        const nodeName = node.getName();
    
        // Find pods that are scheduled on this node
        const podsOnNode = podStore.items
          .filter((pod: Renderer.K8sApi.Pod) => pod.spec.nodeName === nodeName)
          .map((pod: Renderer.K8sApi.Pod) => ({
            name: pod.getName(),
            status: pod.getStatusMessage(),
            podIP: pod.status.podIP,
            nodeName: pod.spec.nodeName,
            startTime: pod.status.startTime,
            qosClass: pod.status.qosClass,
            restartCount: (pod.status.containerStatuses || []).reduce((acc, status) => acc + status.restartCount, 0),
            containers: pod.spec.containers.map(container => ({
              name: container.name,
              image: container.image,
              cpuRequest: container.resources.requests?.cpu || 'N/A',
              memoryRequest: container.resources.requests?.memory || 'N/A',
              cpuLimit: container.resources.limits?.cpu || 'N/A',
              memoryLimit: container.resources.limits?.memory || 'N/A',
              restartCount: (pod.status.containerStatuses || []).find(status => status.name === container.name)?.restartCount || 0,
            })),
          }));
    
        return {
          name: nodeName,
          pods: podsOnNode,  // Pods on this node
    
          // Additional node details
          status: node.status.conditions.find(cond => cond.type === "Ready")?.status || "Unknown",
          roles: node.metadata.labels["kubernetes.io/role"] ? [node.metadata.labels["kubernetes.io/role"]] : ["worker"],
          internalIP: node.status.addresses.find(addr => addr.type === "InternalIP")?.address,
          externalIP: node.status.addresses.find(addr => addr.type === "ExternalIP")?.address,
          kubeletVersion: node.status.nodeInfo.kubeletVersion,
          operatingSystem: node.status.nodeInfo.operatingSystem,
          kernelVersion: node.status.nodeInfo.kernelVersion,
          containerRuntimeVersion: node.status.nodeInfo.containerRuntimeVersion,
          conditions: node.status.conditions.map(cond => ({
            type: cond.type,
            status: cond.status,
            reason: cond.reason,
            message: cond.message,
            lastTransitionTime: cond.lastTransitionTime,
          })),
          capacity: node.status.capacity, // Add capacity information
          allocatable: node.status.allocatable, // Add allocatable information
          labels: node.metadata.labels,
          annotations: node.metadata.annotations,
        };
      });
    
      setNodes(fixedNodes);  // Store fixed nodes in state
      renderScene(fixedNodes);
    };

    const renderScene = (nodes: NodeData[]) => {
      // Set up Three.js scene
      const scene = new THREE.Scene();
      const backgroundColor = new THREE.Color(0x070738);
      backgroundColor.multiplyScalar(0.9); // Darker background
      scene.background = backgroundColor;

      const initialCameraPosition = new THREE.Vector3(10, 20, 50); // Adjusted: more to the right and lower down
      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(initialCameraPosition.x, initialCameraPosition.y, initialCameraPosition.z); // Move the camera further back and slightly to the right
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      mountRef.current!.appendChild(renderer.domElement);

      // Lighting setup
      const ambientLight = new THREE.AmbientLight(0x4040ff, 2); // Blue ambient light for a cyber feel
      scene.add(ambientLight);

      const pointLight = new THREE.PointLight(0xffffff, 1, 100);
      pointLight.position.set(5, 15, 10);
      pointLight.castShadow = true;
      scene.add(pointLight);

      // Configure Raycaster to detect clicks
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      const handleClick = (event: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
        raycaster.setFromCamera(mouse, camera);
      
        // Limit click targets
        const intersects = raycaster.intersectObjects(
          scene.children.filter(obj => obj.userData && (obj.userData.isNode || obj.userData.isPod || obj.userData.isGround)), // 地面も含める
          true
        );
      
        if (intersects.length > 0) {
          const clickedObject = intersects[0].object;
      
          if (clickedObject.userData.isNode && clickedObject instanceof THREE.Mesh) {
            setSelectedNode(clickedObject.userData.node);
            setSelectedPod(null); 
            // Apply blinking effect to new node
            blinkEffect(clickedObject as THREE.Mesh, new THREE.Color(0xffa500), clickedObject.userData.originalColor);
            // Added processing to zoom up to the ceiling of the node.
            const nodeTopPosition = new THREE.Vector3(
              clickedObject.position.x,
              clickedObject.position.y + clickedObject.geometry.parameters.height / 2,
              clickedObject.position.z
            );
            // Camera zooms in on the ceiling of the clicked node.
            zoomToNodeTop(nodeTopPosition, camera, controls);
          } else if (clickedObject.userData.isPod) {
            setSelectedPod(clickedObject.userData.pod);
            setSelectedNode(null); 
            blinkEffect(clickedObject as THREE.Mesh, new THREE.Color(0xffa500), clickedObject.userData.originalColor);
            const podPosition = clickedObject.position;
            zoomToPod(podPosition, camera, controls);
          } 
        }
      };
    
      const handleMouseMove = (event: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(
          scene.children.filter(obj => obj.userData && (obj.userData.isNode || obj.userData.isPod )), 
          true
        );

        // Processing to change the cursor
        if (intersects.length > 0) {
          document.body.style.cursor = 'pointer';
        } else {
          document.body.style.cursor = 'auto';
        }
      };
    
      renderer.domElement.addEventListener('click', handleClick);
      renderer.domElement.addEventListener('mousemove', handleMouseMove);

      // ground size
      const planeGeometry = new THREE.PlaneGeometry(100, 100);
      const planeMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        side: THREE.DoubleSide,
        transparent: true, 
        opacity: 0.9 
      });
      const groundPlane = new THREE.Mesh(planeGeometry, planeMaterial);
      groundPlane.rotation.x = Math.PI / 2;
      groundPlane.userData.isGround = true; 
      scene.add(groundPlane);

      // Background grid
      const gridHelper = new THREE.GridHelper(100, 100, 0x00ff00, 0x00ffff);
      scene.add(gridHelper);

      // Add particles (like distant stars)
      const particleCount = 100;
      const particlesGeometry = new THREE.BufferGeometry();
      const positions = [];
      const colors = [];
      
      for (let i = 0; i < particleCount; i++) {
        positions.push((Math.random() - 0.5) * 100);
        positions.push((Math.random() - 0.5) * 100);
        positions.push((Math.random() - 0.5) * 100);

        const color = new THREE.Color();
        color.setHSL(Math.random(), 1.0, 0.6); 
        colors.push(color.r, color.g, color.b); 
      }
      
      particlesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      particlesGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      
      const particleMaterial = new THREE.PointsMaterial({
        size: 2,
        map: generateSprite(),
        transparent: true,
        opacity: 0.9, 
        blending: THREE.AdditiveBlending, 
        depthWrite: false,
        vertexColors: false,
        color: new THREE.Color(0x87CEFA),
        sizeAttenuation: true
      });       
      const particleSystem = new THREE.Points(particlesGeometry, particleMaterial);
      scene.add(particleSystem);

      // OrbitControls for camera interaction
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.25;
      controls.enableZoom = true;
      controlsRef.current = controls;

      // Function to create glowing edges
      const createGlowEffect = (cube: THREE.Mesh) => {
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: 0x00ffff,
          transparent: true,
          opacity: 0.5,
          wireframe: true
        });

        // Create glow mesh using the cube's geometry
        const glow = new THREE.Mesh(cube.geometry, glowMaterial);

        // Set the position and scale of the glow to match the cube
        glow.position.copy(cube.position);
        glow.scale.copy(cube.scale).multiplyScalar(1.1); // Scale it slightly larger for the glow effect

        // Add glow to the scene
        scene.add(glow);
      };

      // Loop through each node and create a semi-transparent cube
      nodes.forEach((node, index) => {
        const nodeHeight = 6; 
        const nodeWidth = 4; 
        const nodeDepth = 4;
        const nodeGeometry = new THREE.BoxGeometry(nodeWidth, nodeHeight, nodeDepth); 
        const nodeMaterial = new THREE.MeshStandardMaterial({
          color: 0x00bfff,
          transparent: true,
          opacity: 0.6, // Semi-transparent
          metalness: 0.8,
          roughness: 0.4,
          emissive: 0x00bfff,
          emissiveIntensity: 0.6,
        });

        const nodeCube = new THREE.Mesh(nodeGeometry, nodeMaterial);
        nodeCube.userData = { 
          isNode: true, 
          node, 
          originalColor: nodeMaterial.color.clone(),
          originalEmissiveColor: nodeMaterial.emissive.clone()
        };
        nodeCube.name = `node-${index}`; 
        console.log("Node userData set:", nodeCube.userData);
        nodeCube.position.set(index * nodeWidth * 2 - 5, nodeHeight / 2, 0); 
        nodeCube.castShadow = true;
        scene.add(nodeCube);

        // Add glow effect to each node
        createGlowEffect(nodeCube);

        // Node name label (centered on the node)
        const nodeLabel = createNodeLabel(node.name, {
          x: nodeCube.position.x,
          y: nodeCube.position.y - nodeHeight / 2 - 0.5,
          z: nodeCube.position.z + 0.5
        });
        scene.add(nodeLabel);

        // Loop through each pod of the node and create smaller, semi-transparent cubes stacked on top
        node.pods.forEach((pod, podIndex) => {
          const podGeometry = new THREE.BoxGeometry(0.15, 0.15, 0.15); // Pod size reduced by half
          let podColor: number;
          switch (pod.status) {
            case "Running":
              podColor = 0x00ff00;  // Green for Running
              break;
            case "Pending":
              podColor = 0xFFD700;  // Yellow (Gold) for Pending
              break;
            case "Failed":
              podColor = 0xFF4500;  // Red (OrangeRed) for Failed
              break;
            default:
              podColor = 0xA9A9A9;  // Gray for other statuses
              break;
          }
        
          const podMaterial = new THREE.MeshStandardMaterial({
            color: podColor,
            transparent: true,
            opacity: 0.6,
            emissive: podColor,
            emissiveIntensity: 0.4,
          });
                
          const podCube = new THREE.Mesh(podGeometry, podMaterial);
          podCube.userData = { 
            isPod: true, 
            pod, 
            originalColor: podMaterial.color.clone(),
            originalEmissiveColor: podMaterial.emissive.clone()
          };
          podCube.name = `pod-${podIndex}`; 
          console.log("Pod userData set:", podCube.userData); 
            
          // Calculate pod position within the node's box
          const nodePosition = nodeCube.position.clone();
          const podMaxPerRow = 6; // Limit each row to 6 pods
          const podSpacingX = (nodeWidth - 0.15) / podMaxPerRow; // Adjusted spacing for X-axis within node
          const podSpacingZ = 0.3; // Spacing between pods on the Z-axis
          const podRow = Math.floor(podIndex / podMaxPerRow); // Row index
          const podColumn = podIndex % podMaxPerRow; // Column index

          // Adjust Z position to reverse the order (back to front)
          const totalRowWidth = podSpacingX * (Math.min(podMaxPerRow, node.pods.length) - 1);
          const podX = nodePosition.x - totalRowWidth / 2 + podSpacingX * podColumn;
          // Pod Z position: Arrange from the back with the Z axis in the opposite direction
          const podZ = nodePosition.z + (podRow * podSpacingZ);

          // Adjust Y position to be above the Node
          const podY = nodePosition.y + nodeHeight / 2 + 0.4; // Adjusted height to be above the node

          // Set pod position within node bounds and above node
          podCube.position.set(podX, podY, podZ);
              
          scene.add(podCube);
        
          // Add glow effect to pods
          createGlowEffect(podCube);
        
          // Pod name label (centered on the pod)
          const isSelected = selectedPod?.name === pod.name;
          const podLabel = createPodLabel(pod.name, { 
            x: podCube.position.x, 
            y: podCube.position.y + 0.05,  // Display slightly above (0.05) the height of the Pod (0.15)
            z: podCube.position.z 
          }, isSelected); // Pass the isSelected value
          podCube.userData.label = podLabel;
          scene.add(podLabel);
        });
      });

      // Animation loop
      const animate = function () {
        requestAnimationFrame(animate);
        particleSystem.rotation.y += 0.00025;  // Add slow rotation to the particles for a dynamic effect
        controls.update();  // OrbitControls for better interaction
        renderer.render(scene, camera);
      };
      animate();
    };

    const zoomToNodeTop = (position: THREE.Vector3, camera: THREE.PerspectiveCamera, controls: OrbitControls) => {
      // Calculate a new position for the camera relative to the node
      const targetPosition = new THREE.Vector3(position.x, position.y, position.z);
    
      gsap.to(camera.position, {
        x: targetPosition.x + 5, // Offset by 5 units on X-axis
        y: targetPosition.y + 5, // Offset by 5 units on Y-axis
        z: targetPosition.z + 10, // Offset by 10 units on Z-axis
        duration: 1.5,
        ease: "power2.inOut",
        onUpdate: () => {
          controls.update(); // Update the controls during animation
          camera.lookAt(targetPosition); // Ensure the camera is looking at the node
        }
      });
    };

    const zoomToPod = (position: THREE.Vector3, camera: THREE.PerspectiveCamera, controls: OrbitControls) => {
      // Define the target position for the camera (where the Pod is)
      const targetPosition = new THREE.Vector3(position.x, position.y, position.z);
    
      // Get the current camera direction (where it is looking)
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
    
      // Move the camera closer to the Pod by reducing the scalar distance for stronger zoom
      const newCameraPosition = targetPosition.clone().add(direction.multiplyScalar(-3)); // Closer zoom
    
      gsap.to(camera.position, {
        x: newCameraPosition.x,
        y: newCameraPosition.y + 1,  // Slightly above the Pod, closer Y offset
        z: newCameraPosition.z,
        duration: 1.5,
        ease: "power2.inOut",
        onUpdate: () => {
          controls.update(); // Update the controls during animation
          camera.lookAt(targetPosition); // Ensure the camera is looking at the Pod's position
        },
      });
    };

    // Load data and render the scene
    loadData();

    // Clean up on component unmount
    return () => {
      mountRef.current!.removeChild(mountRef.current!.firstChild!);
    };
  }, []);

  // Process to hide icons while scrolling and redisplay them after scrolling
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const scrollLeft = e.currentTarget.scrollLeft;
    const icon = document.getElementById('camera-icon');

    if (icon) {
      icon.style.transition = '';
      icon.style.opacity = '0';

      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }

      // Redisplay after scrolling
      scrollTimeout = setTimeout(() => {
        icon.style.transform = `translate(${scrollLeft}px, ${scrollTop}px)`;
        icon.style.transition = 'opacity 0.3s ease';
        icon.style.opacity = '1';
      }, 150);
    }
  };

  // Mouse down handler for starting the drag
  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  // Mouse move handler to adjust the split size during drag
  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isDragging) return;

    const newSplitSize = (event.clientX / window.innerWidth) * 100;
    if (newSplitSize > 20 && newSplitSize < 90) {
      setSplitSize(newSplitSize);
    }
  }, [isDragging]);

  // Mouse up handler to stop the drag
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Processing to return camera position to default
  const resetCameraPosition = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls) {
      gsap.to(camera.position, {
        x: 10,
        y: 20,
        z: 50,
        duration: 1.5,
        ease: "power2.inOut",
        onUpdate: () => controls.update(),
      });
    }
  };

  return (
    <div style={{ display: 'flex', height: '750px', position: 'relative' }}>
      <div 
        ref={mountRef} 
        style={{ 
          height: '100%', 
          flex: `0 0 ${splitSize}%`, 
          border: '2px solid #ccc', 
          overflow: 'auto', 
          position: 'relative' 
        }} 
        onScroll={handleScroll} 
      >
        {/* A camera reset icon is placed at the bottom left of the 3D screen to follow the scroll. */}
        <div 
          id="camera-icon"
          style={{ 
            position: 'absolute', 
            bottom: '20px', 
            left: '20px', 
            transform: 'translate(0, 0)',
            cursor: 'pointer', 
            zIndex: 1000,
            opacity: '1'
          }}
        >
          <CameraswitchIcon style={{ fontSize: 40, color: '#00E5FF' }} onClick={resetCameraPosition} />
        </div>
      </div>
      <div 
        style={{
          width: '5px', 
          cursor: 'ew-resize', 
          backgroundColor: '#ccc', 
          height: '100%',
          zIndex: 10, 
        }}
        onMouseDown={handleMouseDown}
      />
      <div style={{ 
        padding: '10px', 
        background: '#2E2E2E', 
        height: '100%', 
        flex: `1`, 
        overflow: 'auto' 
      }}>
        <NodePodDetails node={selectedNode} pod={selectedPod} />
      </div>
    </div>
  );
};

// Function to create text as a 2D sprite for Node/Pod information
function createPodLabel(text: string, position: { x: number, y: number, z: number }, isSelected: boolean) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = isSelected ? 2048 : 512;
  canvas.height = isSelected ? 512 : 128; 

  context!.clearRect(0, 0, canvas.width, canvas.height);

  context!.font = `Bold ${isSelected ? 128 : 32}px Arial`;
  context!.fillStyle = 'white';
  context!.textAlign = 'center';
  context!.textBaseline = 'middle';

  context!.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true; 
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);

  sprite.position.set(position.x, position.y + (isSelected ? 0.8 : 0.4), position.z);
  sprite.scale.set(isSelected ? 2 : 0.5, isSelected ? 1 : 0.25, 0.1);

  return sprite;
}

function createNodeLabel(text: string, position: { x: number, y: number, z: number }) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  // Increase canvas width and height to better accommodate text
  canvas.width = 1024;
  canvas.height = 128;

  // Make sure the canvas background is fully transparent
  context!.clearRect(0, 0, canvas.width, canvas.height);  // Clear the canvas to ensure transparency

  // Set text properties
  context!.font = 'Bold 32px Arial';  // Larger font for better readability
  context!.fillStyle = 'white';       // White text color
  context!.textAlign = 'center';      // Center text horizontally
  context!.textBaseline = 'middle';   // Center text vertically

  // Draw the text in the center of the canvas
  context!.fillText(text, canvas.width / 2, canvas.height / 2);

  // Create a texture from the canvas and apply it to the material
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,  // Disable depth testing to ensure the label is always visible
  });
  const sprite = new THREE.Sprite(material);

  // Position the label slightly above the node
  sprite.position.set(position.x, position.y + 2.5, position.z);  // Adjust height above the node
  sprite.scale.set(8, 2, 2);  // Scale the label for better visibility

  return sprite;
}

// blinkEffect function ---
const blinkEffect = (object: THREE.Mesh, blinkColor: THREE.Color, originalColor: THREE.Color) => {
  const material = object.material as THREE.MeshStandardMaterial;

  if (!material.emissive) return;

  if (object === currentBlinkingNode || object === currentBlinkingPod) return;

  // End the previous blinking and return to the initial state
  if (currentBlinkingNode) {
    gsap.killTweensOf(currentBlinkingNode.material);
    const prevMaterial = currentBlinkingNode.material as THREE.MeshStandardMaterial;
    prevMaterial.emissive.set(currentBlinkingNode.userData.originalEmissiveColor || new THREE.Color(0x000000));
    prevMaterial.color.set(currentBlinkingNode.userData.originalColor || new THREE.Color(0x000000));
    prevMaterial.emissiveIntensity = currentBlinkingNode.userData.originalEmissiveIntensity || 0;
    currentBlinkingNode = null;
  }

  if (currentBlinkingPod) {
    gsap.killTweensOf(currentBlinkingPod.material);
    const prevMaterial = currentBlinkingPod.material as THREE.MeshStandardMaterial;
    prevMaterial.emissive.set(currentBlinkingPod.userData.originalEmissiveColor || new THREE.Color(0x000000));
    prevMaterial.color.set(currentBlinkingPod.userData.originalColor || new THREE.Color(0x000000));
    prevMaterial.emissiveIntensity = currentBlinkingPod.userData.originalEmissiveIntensity || 0;

    // Return the label to its original size
    if (currentLabelSprite) {
      const originalScale = currentLabelSprite.userData.originalScale || new THREE.Vector3(0.5, 0.25, 0.1);
      currentLabelSprite.scale.set(originalScale.x, originalScale.y, originalScale.z);

      // Stop text blinking effect
      gsap.killTweensOf(currentLabelSprite.material.color);
      currentLabelSprite.material.color.set('white');

      currentLabelSprite = null;
    }

    currentBlinkingPod = null;
  }

  // Preserves original color and color/intensity of emitted light
  object.userData.originalEmissiveColor = material.emissive.clone();
  object.userData.originalColor = material.color.clone();
  object.userData.originalEmissiveIntensity = material.emissiveIntensity;

  // Apply blinking effect
  const tween = gsap.to(material, {
    emissiveIntensity: 1.5, 
    duration: 2,
    ease: "power2.inOut",
    repeat: -1,
    yoyo: true,
    onUpdate: () => {
      material.emissive.set(blinkColor);
    },
  });

  // Set current blinking object
  if (object.userData.isNode) {
    currentBlinkingNode = object;
  } else if (object.userData.isPod) {
    currentBlinkingPod = object;

    // Expand label when Pod is selected
    if (object.userData.label) {
      const label = object.userData.label;
      if (!label.userData.originalScale) {
        label.userData.originalScale = label.scale.clone();
      }
      label.scale.set(2, 1, 0.1);
      currentLabelSprite = label;

      // Also applies blinking text effect
      const labelMaterial = label.material as THREE.SpriteMaterial;
      const blinkColor = new THREE.Color(0xFFD27F);
      gsap.to(labelMaterial.color, {
        r: blinkColor.r,
        g: blinkColor.g,
        b: blinkColor.b,
        duration: 2,  // Sync with the Pod blink
        ease: "power2.inOut",
        repeat: -1,
        yoyo: true,
        onUpdate: () => {
          labelMaterial.needsUpdate = true; // Force update to apply the color change
        },
      });
    }
  }

  // Method to stop blinking effect
  object.userData.stopBlinkEffect = () => {
    tween.kill();
    material.emissive.set(object.userData.originalEmissiveColor || new THREE.Color(0x000000));
    material.color.set(object.userData.originalColor || new THREE.Color(0x000000));
    material.emissiveIntensity = object.userData.originalEmissiveIntensity || 0;

    // Restore label size
    if (currentLabelSprite) {
      const originalScale = currentLabelSprite.userData.originalScale || new THREE.Vector3(0.5, 0.25, 0.1);
      currentLabelSprite.scale.set(originalScale.x, originalScale.y, originalScale.z);

      // Stop text blinking effect
      gsap.killTweensOf(currentLabelSprite.material.color);
      currentLabelSprite.material.color.set('white');

      currentLabelSprite = null;
    }
  };
};

// Component for displaying details of a selected node or pod
const NodePodDetails: React.FC<{ node: NodeData | null, pod: PodData | null }> = ({ node, pod }) => {
  // Future-style card with glow effects and animations
  const cardStyles = {
    background: 'linear-gradient(135deg, #1A237E 0%, #0D47A1 50%, #1A237E 100%)', // Gradient background
    boxShadow: '0 0 15px rgba(0, 255, 255, 0.5)', // Neon glow shadow
    border: '1px solid rgba(0, 255, 255, 0.5)', // Neon border
    borderRadius: '15px',
    padding: '20px',
    overflow: 'hidden',
  };

  const textStylePrimary = {
    color: '#00E5FF', // Neon blue text
    fontWeight: 'bold',
    fontFamily: "'Roboto Mono', monospace", // Monospace futuristic font
  };

  const textStyleSecondary = {
    color: '#B3E5FC', // Lighter neon blue
    fontFamily: "'Roboto Mono', monospace",
  };

  const fadeIn = (element: HTMLElement | null) => {
    if (element) {
      gsap.fromTo(element, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power1.out' });
    }
  };

  if (node) {
    return (
      <Card variant="outlined" sx={cardStyles} ref={fadeIn}>
        <CardContent>
          {/* Node Title */}
          <Typography variant="h5" component="div" sx={textStylePrimary}>
            {node.name}
          </Typography>

          <Divider sx={{ marginY: 2, backgroundColor: '#00E5FF' }} />

          <List>
            {/* Node Kind */}
            <ListItem>
              <ListItemText
                primary="Kind"
                secondary="Node"
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>

            {/* Node Status */}
            <ListItem>
              <ListItemText
                primary="Status"
                secondary={node.status}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>

            {/* Node Roles */}
            <ListItem>
              <ListItemText
                primary="Roles"
                secondary={node.roles.join(', ')}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>

            {/* Node IPs */}
            <ListItem>
              <ListItemText
                primary="Internal IP"
                secondary={node.internalIP || 'N/A'}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="External IP"
                secondary={node.externalIP || 'N/A'}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>

            {/* Kubernetes Version */}
            <ListItem>
              <ListItemText
                primary="Kubernetes Version"
                secondary={node.kubeletVersion || 'N/A'}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>

            {/* Operating System */}
            <ListItem>
              <ListItemText
                primary="Operating System"
                secondary={node.operatingSystem || 'N/A'}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>

            {/* Kernel Version */}
            <ListItem>
              <ListItemText
                primary="Kernel Version"
                secondary={node.kernelVersion || 'N/A'}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>

            {/* Container Runtime Version */}
            <ListItem>
              <ListItemText
                primary="Container Runtime Version"
                secondary={node.containerRuntimeVersion || 'N/A'}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>

            {/* Node Resource Info */}
            <Typography variant="h6" sx={textStylePrimary}>
              Node Resource Information
            </Typography>
            <ListItem>
              <ListItemText
                primary="CPU Capacity"
                secondary={node.capacity?.cpu || 'N/A'}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Memory Capacity"
                secondary={node.capacity?.memory || 'N/A'}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Allocatable CPU"
                secondary={node.allocatable?.cpu || 'N/A'}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Allocatable Memory"
                secondary={node.allocatable?.memory || 'N/A'}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>

            {/* Conditions */}
            <Typography variant="h6" sx={textStylePrimary}>Conditions</Typography>
            {node.conditions.map((condition, index) => (
              <ListItem key={index}>
                <ListItemText
                  primary={condition.type}
                  secondary={`${condition.status} - ${condition.reason || ''}`}
                  primaryTypographyProps={{ style: textStylePrimary }}
                  secondaryTypographyProps={{ style: textStyleSecondary }}
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
    );
  }

  if (pod) {
    return (
      <Card variant="outlined" sx={cardStyles} ref={fadeIn}>
        <CardContent>
          {/* Pod Title */}
          <Typography variant="h5" component="div" sx={textStylePrimary}>
            {pod.name}
          </Typography>

          <Divider sx={{ marginY: 2, backgroundColor: '#00E5FF' }} />

          <List>
            {/* Pod Kind */}
            <ListItem>
              <ListItemText
                primary="Kind"
                secondary="Pod"
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>

            {/* Pod Status */}
            <ListItem>
              <ListItemText
                primary="Status"
                secondary={pod.status}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>

            {/* Pod IP, Node Name, Start Time */}
            <ListItem>
              <ListItemText
                primary="Pod IP"
                secondary={pod.podIP || 'N/A'}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Node Name"
                secondary={pod.nodeName || 'N/A'}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                primary="Start Time"
                secondary={pod.startTime || 'N/A'}
                primaryTypographyProps={{ style: textStylePrimary }}
                secondaryTypographyProps={{ style: textStyleSecondary }}
              />
            </ListItem>

            {/* Containers */}
            <Typography variant="h6" component="div" sx={textStylePrimary}>
              Containers
            </Typography>
            {pod.containers?.map((container, index) => (
              <Box key={container.name} sx={{ marginBottom: 3, padding: 2, background: "rgba(0, 128, 255, 0.1)", borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={textStylePrimary}>Container {index + 1}: {container.name}</Typography>
                <Divider sx={{ marginY: 1, backgroundColor: '#00E5FF' }} />
                <List>
                  <ListItem>
                    <ListItemText
                      primary="Image"
                      secondary={container.image}
                      primaryTypographyProps={{ style: textStylePrimary }}
                      secondaryTypographyProps={{ style: textStyleSecondary }}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="CPU Request"
                      secondary={container.cpuRequest}
                      primaryTypographyProps={{ style: textStylePrimary }}
                      secondaryTypographyProps={{ style: textStyleSecondary }}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Memory Request"
                      secondary={container.memoryRequest}
                      primaryTypographyProps={{ style: textStylePrimary }}
                      secondaryTypographyProps={{ style: textStyleSecondary }}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="CPU Limit"
                      secondary={container.cpuLimit}
                      primaryTypographyProps={{ style: textStylePrimary }}
                      secondaryTypographyProps={{ style: textStyleSecondary }}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Memory Limit"
                      secondary={container.memoryLimit}
                      primaryTypographyProps={{ style: textStylePrimary }}
                      secondaryTypographyProps={{ style: textStyleSecondary }}
                    />
                  </ListItem>
                </List>
              </Box>
            ))}
          </List>
        </CardContent>
      </Card>
    );
  }

  return (
    <Typography
      variant="body2"
      sx={{ color: '#FFFFFF', padding: '20px', textAlign: 'center', background: 'rgba(0, 128, 255, 0.1)', borderRadius: '15px' }}
    >
      Select a node or pod to see details
    </Typography>
  );
};

// Sprite generation function for particles
function generateSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;

  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    0,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width / 2
  );
  
  // Make particles blue-white
  gradient.addColorStop(0, 'rgba(173, 216, 230, 1)');
  gradient.addColorStop(0.4, 'rgba(135, 206, 250, 0.5)');
  gradient.addColorStop(0.7, 'rgba(135, 206, 250, 0.2)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.Texture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export const ExampleIcon = () => (
  <svg width="24" height="24" fill="currentColor">
    <circle cx="12" cy="12" r="10" />
  </svg>
);
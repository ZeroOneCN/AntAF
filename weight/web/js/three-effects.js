// Three.js 动态效果 - 粒子光环系统
let scene, camera, renderer;
let particles, rings = [];
let animationId;

export function initThreeEffects() {
  const canvas = document.getElementById('threeCanvas');
  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }

  // 创建场景
  scene = new THREE.Scene();
  scene.background = null; // 透明背景

  // 创建相机
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 5;

  // 创建渲染器
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  // 创建粒子系统
  createParticles();

  // 创建光环
  createRings();

  // 窗口大小调整
  window.addEventListener('resize', onWindowResize);

  // 开始动画
  animate();
}

function createParticles() {
  const particleCount = 150;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    
    // 在中心圆周围随机分布粒子
    const radius = 2 + Math.random() * 2;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    
    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = radius * Math.cos(phi);

    // 蓝色系粒子
    const color = new THREE.Color();
    color.setHSL(0.55 + Math.random() * 0.1, 0.8, 0.5 + Math.random() * 0.3);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[i] = Math.random() * 0.05 + 0.02;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  // 创建粒子材质
  const material = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  particles = new THREE.Points(geometry, material);
  scene.add(particles);
}

function createRings() {
  // 创建多个旋转光环
  for (let i = 0; i < 3; i++) {
    const geometry = new THREE.TorusGeometry(2.5 + i * 0.3, 0.02, 16, 100);
    const material = new THREE.MeshBasicMaterial({
      color: 0x0066cc,
      transparent: true,
      opacity: 0.15 - i * 0.03,
      side: THREE.DoubleSide
    });
    
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    ring.rotation.y = Math.random() * Math.PI;
    ring.userData = {
      rotationSpeed: 0.001 + Math.random() * 0.002,
      initialRotation: ring.rotation.clone()
    };
    
    scene.add(ring);
    rings.push(ring);
  }
}

function animate() {
  animationId = requestAnimationFrame(animate);

  // 粒子旋转
  if (particles) {
    particles.rotation.y += 0.002;
    particles.rotation.x += 0.001;
    
    // 粒子波动效果
    const positions = particles.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      const distance = Math.sqrt(x * x + y * y + z * z);
      const wave = Math.sin(Date.now() * 0.001 + distance) * 0.1;
      
      positions[i] += wave * 0.01;
      positions[i + 1] += wave * 0.01;
      positions[i + 2] += wave * 0.01;
    }
    particles.geometry.attributes.position.needsUpdate = true;
  }

  // 光环旋转
  rings.forEach((ring, index) => {
    ring.rotation.z += ring.userData.rotationSpeed;
    ring.rotation.x += ring.userData.rotationSpeed * 0.5;
    
    // 光环呼吸效果
    const scale = 1 + Math.sin(Date.now() * 0.001 + index) * 0.05;
    ring.scale.set(scale, scale, scale);
  });

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
}

export function stopThreeEffects() {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  
  if (renderer) {
    renderer.dispose();
  }
  
  window.removeEventListener('resize', onWindowResize);
}

// 导出以便在 main.js 中使用
export { scene, camera, renderer };

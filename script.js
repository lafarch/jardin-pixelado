// ============================================
// JARDÍN PIXELADO INTERACTIVO
// ============================================

// Configuración del Canvas
const canvas = document.getElementById('garden-canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const PIXEL_SIZE = 10; // Tamaño de cada "pixel" para el arte pixelado
const GRID_WIDTH = 60;
const GRID_HEIGHT = 40;
const CANVAS_WIDTH = GRID_WIDTH * PIXEL_SIZE;
const CANVAS_HEIGHT = GRID_HEIGHT * PIXEL_SIZE;

canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// Configuración de Sprites de Alta Resolución
const SPRITE_INTERNAL_WIDTH = 64;  // Ancho interno del sprite
const SPRITE_INTERNAL_HEIGHT = 128; // Alto interno del sprite (para flores finales)
const SPRITE_SCALE = 0.8; // Escala para renderizar en el canvas (ajustable)

// Estado del Juego
let selectedSeed = 'lily';
let wateringCanActive = false;
let waterCount = 0;
let dayCount = 1;
let plants = []; // Array de plantas en el jardín
let waterParticles = []; // Partículas de agua para efectos visuales
let animationFrame = 0; // Frame actual para animaciones
let lastRenderTime = 0; // Para controlar FPS de animaciones
let soilBuffer = null; // Buffer estático del suelo
const spriteCache = {}; // Cache de sprites de alta resolución
let grassBlades = []; // Pasto dinámico
let grassTimer = 0;
const GRASS_SPAWN_INTERVAL = 4000;
const MAX_GRASS_BLADE = 220;
const FLOWER_MAX_LIFESPAN = 48000; // ms en floración antes de marchitar
const PLANT_HITBOX_RADIUS = 80;
let weather = {
    state: 'clear',
    timeInState: 0,
    snowDuration: 0
};
const SNOW_MIN_DURATION = 8000;
const SNOW_STOP_PROBABILITY = 0.002;
const SNOW_START_CHANCE = 0.00001; // probabilidad por ms
let snowflakes = [];
let snowAccumulation = [];

const getTimestamp = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

// Configuración de las flores con 5 etapas de crecimiento
const flowerConfig = {
    lily: {
        name: 'Lirio',
        colors: {
            petalLight: '#FFB6C1', // Rosa claro
            petalDark: '#FF69B4',  // Rosa oscuro
            center: '#FFFFFF',     // Blanco
            stamen: '#FFA500',     // Naranja para estambres
            pistil: '#FFD700',     // Amarillo para pistilo
            stem: '#228B22',       // Verde oscuro
            stemLight: '#32CD32'   // Verde claro
        },
        waterNeeded: [2, 3, 4, 5] // Agua para cada etapa: brote -> mediana -> capullo -> flor
    },
    tulip: {
        name: 'Tulipán',
        colors: {
            petalBase: '#FFD700',  // Amarillo base
            petalMid: '#FF8C00',   // Naranja medio
            petalTop: '#FF4500',   // Rojo intenso punta
            petalDark: '#DC143C',  // Rojo oscuro
            center: '#FFD700',     // Amarillo centro
            stem: '#A5D688',       // Verde pálido principal
            stemLight: '#C4E6A8',  // Verde claro para brillos
            vein: '#FF6347'        // Color para nervaduras
        },
        waterNeeded: [2, 3, 4, 5]
    },
    orchid: {
        name: 'Orquídea',
        colors: {
            petalLight: '#DDA0DD', // Morado claro
            petalMid: '#9370DB',   // Morado medio
            petalDark: '#663399',  // Morado oscuro
            labelo: '#FF69B4',     // Magenta para labelo
            labeloCenter: '#FFD700', // Amarillo centro labelo
            center: '#FFFFFF',     // Blanco
            stem: '#228B22',       // Verde oscuro
            stemLight: '#32CD32'   // Verde claro
        },
        waterNeeded: [2, 3, 4, 5]
    }
};

// ============================================
// SISTEMA DE RENDERIZADO DE ALTA RESOLUCIÓN
// ============================================

/**
 * Dibuja un pixel en la posición (x, y) con el color especificado (sistema antiguo)
 */
function drawPixel(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
}

/**
 * Renderiza un sprite de alta resolución desde una matriz de datos
 * @param {Array} spriteData - Matriz 2D donde cada elemento es un color o null
 * @param {number} x - Posición X en el canvas (centro del sprite)
 * @param {number} y - Posición Y en el canvas (base del sprite)
 * @param {number} scale - Factor de escala (default: SPRITE_SCALE)
 */
function drawHighResSprite(spriteData, x, y, scale = SPRITE_SCALE) {
    const spriteWidth = spriteData[0] ? spriteData[0].length : 0;
    const spriteHeight = spriteData.length;
    
    // Calcular el tamaño renderizado
    const renderWidth = spriteWidth * scale;
    const renderHeight = spriteHeight * scale;
    
    // Posición de inicio (centrado horizontalmente, base en y)
    const startX = x - renderWidth / 2;
    const startY = y - renderHeight;
    
    // Dibujar cada pixel del sprite
    for (let sy = 0; sy < spriteHeight; sy++) {
        for (let sx = 0; sx < spriteWidth; sx++) {
            const color = spriteData[sy] && spriteData[sy][sx];
            if (color && color !== 'transparent') {
                ctx.fillStyle = color;
                ctx.fillRect(
                    startX + sx * scale,
                    startY + sy * scale,
                    scale,
                    scale
                );
            }
        }
    }
}

/**
 * Crea una matriz vacía de tamaño width x height
 */
function createSpriteMatrix(width, height) {
    const matrix = [];
    for (let y = 0; y < height; y++) {
        matrix[y] = new Array(width).fill(null);
    }
    return matrix;
}

/**
 * Dibuja un círculo pixelado en la matriz del sprite
 */
function drawCircleInSprite(sprite, centerX, centerY, radius, color) {
    for (let y = 0; y < sprite.length; y++) {
        for (let x = 0; x < sprite[0].length; x++) {
            const dx = x - centerX;
            const dy = y - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= radius) {
                sprite[y][x] = color;
            }
        }
    }
}

/**
 * Dibuja una línea pixelada en la matriz del sprite
 */
function drawLineInSprite(sprite, x1, y1, x2, y2, color, thickness = 1) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    
    let x = x1;
    let y = y1;
    
    while (true) {
        // Dibujar con grosor
        for (let ty = -Math.floor(thickness/2); ty <= Math.floor(thickness/2); ty++) {
            for (let tx = -Math.floor(thickness/2); tx <= Math.floor(thickness/2); tx++) {
                if (y + ty >= 0 && y + ty < sprite.length && 
                    x + tx >= 0 && x + tx < sprite[0].length) {
                    sprite[y + ty][x + tx] = color;
                }
            }
        }
        
        if (x === x2 && y === y2) break;
        
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            y += sy;
        }
    }
}

/**
 * Obtiene un sprite desde cache o lo genera
 */
function getCachedSprite(key, generator) {
    if (!spriteCache[key]) {
        spriteCache[key] = generator();
    }
    return spriteCache[key];
}

/**
 * Genera el buffer estático del suelo (solo se ejecuta una vez)
 */
function generateSoilBuffer() {
    // Crear un canvas temporal para el buffer
    const bufferCanvas = document.createElement('canvas');
    bufferCanvas.width = CANVAS_WIDTH;
    bufferCanvas.height = CANVAS_HEIGHT;
    const bufferCtx = bufferCanvas.getContext('2d');
    
    // Color base del suelo
    bufferCtx.fillStyle = '#8B4513';
    bufferCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Textura del suelo con variaciones (usando semilla fija)
    const seed = 12345; // Semilla fija para consistencia
    let rng = seed;
    function random() {
        rng = (rng * 1103515245 + 12345) & 0x7fffffff;
        return (rng >>> 0) / 0x7fffffff;
    }
    
    for (let y = 0; y < GRID_HEIGHT; y++) {
        for (let x = 0; x < GRID_WIDTH; x++) {
            if (random() > 0.7) {
                const shade = random() > 0.5 ? '#654321' : '#A0522D';
                bufferCtx.fillStyle = shade;
                bufferCtx.fillRect(x * PIXEL_SIZE, y * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
            }
        }
    }
    
    return bufferCanvas;
}

/**
 * Dibuja el suelo del jardín desde el buffer
 */
function drawSoil() {
    if (!soilBuffer) {
        soilBuffer = generateSoilBuffer();
    }
    ctx.drawImage(soilBuffer, 0, 0);
}

/**
 * Crecimiento y render de pasto dinámico
 */
function spawnGrassBlade() {
    if (grassBlades.length >= MAX_GRASS_BLADE) {
        grassBlades.shift();
    }
    const colors = ['#4B8B3B', '#6AA342', '#8CB356', '#A1C46A', '#708447'];
    grassBlades.push({
        x: Math.random() * CANVAS_WIDTH,
        height: 6 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        sway: Math.random() * Math.PI * 2
    });
}

function updateGrass(delta) {
    grassTimer += delta;
    if (grassTimer >= GRASS_SPAWN_INTERVAL) {
        spawnGrassBlade();
        grassTimer = 0;
    }
}

function drawGrass() {
    grassBlades.forEach(blade => {
        ctx.fillStyle = blade.color;
        const swayOffset = Math.sin(animationFrame * 0.05 + blade.sway);
        for (let i = 0; i < blade.height; i++) {
            const width = 2;
            const x = blade.x + swayOffset * (i * 0.05);
            const y = CANVAS_HEIGHT - i * 2;
            ctx.fillRect(x, y, width, 2);
        }
    });
}

/**
 * Sistema de clima - nieve
 */
function startSnow() {
    weather.state = 'snow';
    weather.timeInState = 0;
    weather.snowDuration = 0;
    if (typeof document !== 'undefined') {
        document.body.classList.add('is-snowing');
    }
}

function stopSnow() {
    weather.state = 'clear';
    weather.timeInState = 0;
    weather.snowDuration = 0;
    if (typeof document !== 'undefined') {
        document.body.classList.remove('is-snowing');
    }
}

function spawnSnowflake() {
    snowflakes.push({
        x: Math.random() * CANVAS_WIDTH,
        y: -10,
        speed: 20 + Math.random() * 25,
        amplitude: 10 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        size: 2 + Math.random() * 2
    });
}

function updateSnow(delta) {
    if (weather.state === 'snow') {
        if (Math.random() < 0.4) {
            spawnSnowflake();
        }
    }
    
    for (let i = snowflakes.length - 1; i >= 0; i--) {
        const flake = snowflakes[i];
        flake.y += (flake.speed * delta) / 1000;
        flake.x += Math.sin((weather.timeInState + flake.phase) * 0.002) * 0.5;
        
        let attachedToPlant = false;
        if (plants.length && weather.state === 'snow') {
            for (const plant of plants) {
                if (plant.state === 'dead') continue;
                if (Math.abs(flake.x - plant.x) < 25) {
                    const plantTop = plant.y - 200;
                    const plantBottom = plant.y - 20;
                    if (flake.y > plantTop && flake.y < plantBottom) {
                        if (snowAccumulation.length < 120) {
                            snowAccumulation.push({
                                x: plant.x + (Math.random() * 20 - 10),
                                y: plant.y - (Math.random() * 120 + 20),
                                life: 5000 + Math.random() * 4000
                            });
                        }
                        snowflakes.splice(i, 1);
                        attachedToPlant = true;
                        break;
                    }
                }
            }
        }
        if (attachedToPlant) {
            continue;
        }
        
        if (flake.y > CANVAS_HEIGHT - 5) {
            if (snowAccumulation.length < 120) {
                snowAccumulation.push({
                    x: flake.x,
                    y: CANVAS_HEIGHT - 6 - Math.random() * 4,
                    life: 8000 + Math.random() * 4000
                });
            }
            snowflakes.splice(i, 1);
        } else if (flake.x < -20 || flake.x > CANVAS_WIDTH + 20) {
            snowflakes.splice(i, 1);
        }
    }
    
    for (let i = snowAccumulation.length - 1; i >= 0; i--) {
        const deposit = snowAccumulation[i];
        deposit.life -= delta;
        if (deposit.life <= 0) {
            snowAccumulation.splice(i, 1);
        }
    }
}

function drawSnowOverlay() {
    if (weather.state !== 'snow' && snowflakes.length === 0 && snowAccumulation.length === 0) return;
    
    ctx.save();
    if (weather.state === 'snow') {
        ctx.fillStyle = 'rgba(20, 40, 60, 0.25)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    
    ctx.fillStyle = '#FFFFFF';
    snowflakes.forEach(flake => {
        ctx.fillRect(flake.x, flake.y, flake.size, flake.size);
    });
    
    snowAccumulation.forEach(deposit => {
        ctx.globalAlpha = Math.max(0.1, deposit.life / 8000);
        ctx.fillRect(deposit.x, deposit.y, 4, 2);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
}

function updateWeather(delta) {
    weather.timeInState += delta;
    if (weather.state === 'clear') {
        if (Math.random() < SNOW_START_CHANCE * delta) {
            startSnow();
        }
    } else if (weather.state === 'snow') {
        weather.snowDuration += delta;
        if (weather.timeInState > SNOW_MIN_DURATION && Math.random() < SNOW_STOP_PROBABILITY * delta) {
            stopSnow();
        }
    }
}

function markPlantAsDead(plant, reason = 'unknown') {
    plant.state = 'dead';
    plant.deadReason = reason;
    plant.bounceTime = 0;
    plant.evolving = 0;
}

function updatePlantLife(delta) {
    plants.forEach(plant => {
        if (plant.state === 'dead') {
            return;
        }
        plant.age = (plant.age || 0) + delta;
        
        if (plant.state === 'flower') {
            plant.timeInFlower = (plant.timeInFlower || 0) + delta;
            
            // Muerte por vejez
            if (plant.timeInFlower > FLOWER_MAX_LIFESPAN) {
                markPlantAsDead(plant, 'old');
                return;
            }
            
            // Riesgo por frío
            if (weather.state === 'snow' && weather.snowDuration > 10000) {
                plant.freezeClock = (plant.freezeClock || 0) + delta;
                if (plant.freezeClock > 1500) {
                    plant.freezeClock = 0;
                    if (Math.random() < 0.3) {
                        markPlantAsDead(plant, 'cold');
                        return;
                    }
                }
            } else {
                plant.freezeClock = 0;
            }
        }
    });
}

// ============================================
// GENERADORES DE SPRITES DE ALTA RESOLUCIÓN
// ============================================

/**
 * Genera sprite de semilla (etapa 1)
 */
function generateSeedSprite() {
    const sprite = createSpriteMatrix(8, 8);
    // Semilla ovalada marrón
    for (let y = 2; y < 6; y++) {
        for (let x = 2; x < 6; x++) {
            if ((x-3.5)*(x-3.5)/4 + (y-3.5)*(y-3.5)/2 < 1) {
                sprite[y][x] = '#654321';
            }
        }
    }
    // Punto más oscuro
    sprite[3][3] = '#3D2817';
    sprite[4][4] = '#3D2817';
    return sprite;
}

/**
 * Genera sprite de brote pequeño (etapa 2)
 */
function generateSmallSproutSprite() {
    const sprite = createSpriteMatrix(16, 32);
    const stemColor = '#228B22';
    const leafColor = '#90EE90';
    
    // Tallo delgado
    for (let y = 20; y < 32; y++) {
        sprite[y][8] = stemColor;
        sprite[y][7] = stemColor;
    }
    
    // Hojas pequeñas
    for (let y = 18; y < 22; y++) {
        for (let x = 4; x < 12; x++) {
            if (Math.abs(x - 8) + Math.abs(y - 20) < 3) {
                sprite[y][x] = leafColor;
            }
        }
    }
    
    return sprite;
}

/**
 * Genera sprite de planta mediana sin flor (etapa 3)
 */
function generateMediumPlantSprite(type) {
    const sprite = createSpriteMatrix(32, 64);
    const stemColor = '#228B22';
    const stemLight = '#32CD32';
    const leafColor = '#90EE90';
    
    // Tallo más grueso
    for (let y = 40; y < 64; y++) {
        for (let x = 14; x < 18; x++) {
            sprite[y][x] = stemColor;
        }
    }
    
    // Hojas más grandes
    // Hoja izquierda
    for (let y = 30; y < 45; y++) {
        for (let x = 4; x < 16; x++) {
            const dist = Math.sqrt((x-10)*(x-10) + (y-37)*(y-37));
            if (dist < 8 && dist > 2) {
                sprite[y][x] = leafColor;
            }
        }
    }
    
    // Hoja derecha
    for (let y = 30; y < 45; y++) {
        for (let x = 16; x < 28; x++) {
            const dist = Math.sqrt((x-22)*(x-22) + (y-37)*(y-37));
            if (dist < 8 && dist > 2) {
                sprite[y][x] = leafColor;
            }
        }
    }
    
    return sprite;
}

/**
 * Genera sprite de capullo grande (etapa 4)
 */
function generateBudSprite(type) {
    const sprite = createSpriteMatrix(48, 80);
    const config = flowerConfig[type];
    const stemColor = config.colors.stem;
    const budColor = type === 'tulip' ? config.colors.petalBase : 
                     type === 'lily' ? config.colors.petalLight : 
                     config.colors.petalLight;
    
    // Tallo grueso
    for (let y = 50; y < 80; y++) {
        for (let x = 20; x < 28; x++) {
            sprite[y][x] = stemColor;
        }
    }
    
    // Capullo cerrado (forma ovalada)
    for (let y = 20; y < 50; y++) {
        for (let x = 12; x < 36; x++) {
            const dx = (x - 24) / 12;
            const dy = (y - 35) / 15;
            if (dx * dx + dy * dy < 1) {
                sprite[y][x] = budColor;
            }
        }
    }
    
    // Líneas sutiles en el capullo
    for (let y = 25; y < 45; y++) {
        sprite[y][24] = type === 'tulip' ? config.colors.petalMid : budColor;
    }
    
    return sprite;
}

/**
 * Genera sprite de TULIPÁN GIGANTE florecido (etapa 5) estilo copa
 */
function generateTulipFlowerSprite() {
    const sprite = createSpriteMatrix(64, 128);
    const config = flowerConfig.tulip;
    const centerX = 32;
    const cupTop = 18;
    const cupBase = 86;
    const gradient = [
        config.colors.petalDark,
        config.colors.petalMid,
        '#FF6A2E',
        '#FF9440',
        config.colors.petalBase
    ];
    
    // Tallo recto, grueso y verde pálido
    for (let y = cupBase; y < 128; y++) {
        for (let x = 29; x <= 35; x++) {
            sprite[y][x] = config.colors.stem;
        }
        sprite[y][30] = config.colors.stemLight;
    }
    
    // Copa cerrada con forma cilíndrica
    for (let y = cupTop; y < cupBase; y++) {
        const verticalProgress = (y - cupTop) / (cupBase - cupTop);
        const width = 18 + (1 - Math.pow(verticalProgress - 0.3, 2)) * 30; // Más amplia en el centro
        const left = Math.max(4, Math.round(centerX - width / 2));
        const right = Math.min(60, Math.round(centerX + width / 2));
        
        for (let x = left; x <= right; x++) {
            const horizontalProgress = (x - left) / Math.max(1, right - left);
            const shadeIndex = Math.min(gradient.length - 1, Math.floor(horizontalProgress * gradient.length));
            let color = gradient[shadeIndex];
            
            // Sombras en bordes para volumen cilíndrico
            if (horizontalProgress < 0.15 || horizontalProgress > 0.85) {
                color = config.colors.petalDark;
            }
            // Highlight central
            if (horizontalProgress > 0.45 && horizontalProgress < 0.55) {
                color = config.colors.petalBase;
            }
            
            sprite[y][x] = color;
        }
        
        // Borde interior para mostrar la parte cerrada
        if (verticalProgress < 0.2) {
            sprite[y][left] = config.colors.petalDark;
            sprite[y][right] = config.colors.petalDark;
        }
    }
    
    // Borde superior redondeado
    for (let x = 18; x < 46; x++) {
        if (sprite[cupTop][x]) {
            sprite[cupTop - 1][x] = config.colors.petalTop;
        }
    }
    
    // Base de la copa (transición hacia el tallo)
    for (let y = cupBase - 4; y < cupBase + 2; y++) {
        for (let x = centerX - 12; x <= centerX + 12; x++) {
            if (!sprite[y][x]) {
                sprite[y][x] = config.colors.petalBase;
            }
        }
    }
    
    return sprite;
}

/**
 * Genera sprite de LIRIO MAJESTUOSO florecido (etapa 5) con pétalos curvados y estambres
 */
function generateLilyFlowerSprite() {
    const sprite = createSpriteMatrix(64, 128);
    const config = flowerConfig.lily;
    
    // Tallo grueso
    for (let y = 90; y < 128; y++) {
        for (let x = 28; x < 36; x++) {
            sprite[y][x] = config.colors.stem;
        }
    }
    
    // Pétalos curvados hacia atrás (6 pétalos)
    const centerX = 32;
    const centerY = 50;
    const petalCount = 6;
    
    for (let p = 0; p < petalCount; p++) {
        const angle = (p / petalCount) * Math.PI * 2;
        const petalLength = 25;
        const petalWidth = 8;
        
        // Pétalo curvado
        for (let dist = 5; dist < petalLength; dist++) {
            const curve = dist * 0.3; // Curvatura hacia atrás
            const localAngle = angle + curve / 20;
            
            for (let w = -petalWidth/2; w < petalWidth/2; w++) {
                const x = Math.round(centerX + Math.cos(localAngle) * dist + Math.cos(localAngle + Math.PI/2) * w);
                const y = Math.round(centerY + Math.sin(localAngle) * dist + Math.sin(localAngle + Math.PI/2) * w);
                
                if (x >= 0 && x < 64 && y >= 0 && y < 128) {
                    // Degradado en el pétalo
                    const fade = 1 - (dist / petalLength) * 0.3;
                    const color = dist < petalLength * 0.7 ? config.colors.petalLight : config.colors.petalDark;
                    
                    // Patrón tipo "tigre" (manchas)
                    if ((x + y) % 8 < 2) {
                        sprite[y][x] = config.colors.petalDark;
                    } else {
                        sprite[y][x] = color;
                    }
                }
            }
        }
    }
    
    // Estambres (6 estambres con polen naranja)
    for (let s = 0; s < 6; s++) {
        const angle = (s / 6) * Math.PI * 2;
        const stamenLength = 12;
        
        for (let d = 0; d < stamenLength; d++) {
            const x = Math.round(centerX + Math.cos(angle) * d);
            const y = Math.round(centerY + Math.sin(angle) * d);
            
            if (x >= 0 && x < 64 && y >= 0 && y < 128) {
                if (d < stamenLength - 2) {
                    sprite[y][x] = '#FFFFFF'; // Filamento blanco
                } else {
                    sprite[y][x] = config.colors.stamen; // Polen naranja
                }
            }
        }
    }
    
    // Pistilo central (amarillo)
    for (let y = 45; y < 55; y++) {
        for (let x = 30; x < 34; x++) {
            const dist = Math.sqrt((x-32)*(x-32) + (y-50)*(y-50));
            if (dist < 3) {
                sprite[y][x] = config.colors.pistil;
            }
        }
    }
    
    return sprite;
}

/**
 * Genera sprite de ORQUÍDEA tipo Phalaenopsis con tallo arqueado
 */
function generateOrchidFlowerSprite() {
    const sprite = createSpriteMatrix(64, 128);
    const config = flowerConfig.orchid;
    const baseX = 18;
    const baseY = 120;
    
    // Tallo arqueado (curva suave)
    const stemPoints = [];
    for (let t = 0; t <= 1; t += 0.01) {
        const x = baseX + t * 30 + Math.pow(t, 1.5) * 10;
        const y = baseY - t * 75 - Math.sin(t * Math.PI) * 5;
        stemPoints.push({ x: Math.round(x), y: Math.round(y) });
    }
    stemPoints.forEach(point => {
        for (let dx = -1; dx <= 2; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const px = point.x + dx;
                const py = point.y + dy;
                if (px >= 0 && px < 64 && py >= 0 && py < 128) {
                    sprite[py][px] = dx === -1 ? config.colors.stem : config.colors.stemLight;
                }
            }
        }
    });
    
    // Función auxiliar para dibujar flores colgantes
    const drawBloom = (cx, cy, scale = 1) => {
        const size = Math.floor(6 * scale);
        
        // Pétalos laterales anchos
        for (let y = -size; y <= size; y++) {
            for (let x = -Math.floor(size * 1.4); x <= Math.floor(size * 1.4); x++) {
                const dist = Math.sqrt((x * 0.7) ** 2 + (y * 1.2) ** 2);
                if (dist <= size) {
                    const px = cx + x;
                    const py = cy + y;
                    if (px >= 0 && px < 64 && py >= 0 && py < 128) {
                        sprite[py][px] = dist < size * 0.6 ? config.colors.petalMid : config.colors.petalLight;
                    }
                }
            }
        }
        
        // Pétalo superior
        for (let y = -size - 3; y < -size + 1; y++) {
            for (let x = -2; x <= 2; x++) {
                const px = cx + x;
                const py = cy + y;
                if (px >= 0 && px < 64 && py >= 0 && py < 128) {
                    sprite[py][px] = config.colors.petalMid;
                }
            }
        }
        
        // Labelo central distintivo
        for (let y = 0; y <= Math.floor(size / 1.5); y++) {
            for (let x = -Math.floor(size / 2); x <= Math.floor(size / 2); x++) {
                const px = cx + x;
                const py = cy + y;
                if (px >= 0 && px < 64 && py >= 0 && py < 128) {
                    const dist = Math.sqrt((x * 1.3) ** 2 + (y * 0.8) ** 2);
                    if (dist < size / 1.6) {
                        sprite[py][px] = dist < size / 3 ? config.colors.labeloCenter : config.colors.labelo;
                    }
                }
            }
        }
    };
    
    // Posicionar varias flores colgando del tallo
    const bloomPositions = [
        { t: 0.2, scale: 0.9 },
        { t: 0.4, scale: 1 },
        { t: 0.6, scale: 1.1 },
        { t: 0.8, scale: 0.95 }
    ];
    bloomPositions.forEach(pos => {
        const index = Math.floor(pos.t * (stemPoints.length - 1));
        const point = stemPoints[index];
        const cx = point.x + 8; // que cuelgue hacia el lado derecho
        const cy = point.y + 6;
        drawBloom(cx, cy, pos.scale);
    });
    
    return sprite;
}

/**
 * Genera sprite genérico de planta muerta/seca
 */
function generateDeadSprite(type) {
    const sprite = createSpriteMatrix(48, 96);
    const baseColor = '#5A463A';
    const accentColor = '#7B6758';
    const centerX = 24;
    
    // Tallo caído
    for (let y = 60; y < 96; y++) {
        for (let x = 22; x < 26; x++) {
            sprite[y][x] = baseColor;
        }
    }
    
    // Tallo inclinado
    for (let y = 40; y < 60; y++) {
        const offset = Math.floor((60 - y) / 4);
        for (let x = centerX - offset; x <= centerX - offset + 2; x++) {
            if (x >= 0 && x < 48) {
                sprite[y][x] = accentColor;
            }
        }
    }
    
    // Cabeza marchita
    for (let y = 30; y < 50; y++) {
        for (let x = 10; x < 28; x++) {
            const dist = Math.sqrt((x - 16) ** 2 + (y - 40) ** 2);
            if (dist < 10) {
                sprite[y][x] = y % 2 === 0 ? '#6B4F3B' : '#8A6E53';
            }
        }
    }
    
    return sprite;
}

/**
 * Dibuja un Lirio florecido
 */
function drawLily(x, y) {
    const petalColor = flowerConfig.lily.colors.petal;
    const centerColor = flowerConfig.lily.colors.center;
    const stemColor = flowerConfig.lily.colors.stem;
    
    // Tallo
    drawPixel(x, y - 4, stemColor);
    drawPixel(x, y - 3, stemColor);
    drawPixel(x, y - 2, stemColor);
    drawPixel(x, y - 1, stemColor);
    drawPixel(x, y, stemColor);
    
    // Pétalos (forma de estrella)
    // Pétalo superior
    drawPixel(x, y - 5, petalColor);
    drawPixel(x, y - 6, petalColor);
    
    // Pétalos laterales
    drawPixel(x - 1, y - 4, petalColor);
    drawPixel(x - 2, y - 4, petalColor);
    drawPixel(x + 1, y - 4, petalColor);
    drawPixel(x + 2, y - 4, petalColor);
    
    // Pétalos inferiores
    drawPixel(x - 1, y - 3, petalColor);
    drawPixel(x + 1, y - 3, petalColor);
    
    // Centro
    drawPixel(x, y - 4, centerColor);
}

/**
 * Dibuja un Tulipán florecido
 */
function drawTulip(x, y) {
    const petalColor = flowerConfig.tulip.colors.petal;
    const centerColor = flowerConfig.tulip.colors.center;
    const stemColor = flowerConfig.tulip.colors.stem;
    
    // Tallo
    drawPixel(x, y - 3, stemColor);
    drawPixel(x, y - 2, stemColor);
    drawPixel(x, y - 1, stemColor);
    drawPixel(x, y, stemColor);
    
    // Flor (forma de copa)
    drawPixel(x, y - 4, petalColor);
    drawPixel(x - 1, y - 4, petalColor);
    drawPixel(x + 1, y - 4, petalColor);
    drawPixel(x - 1, y - 5, petalColor);
    drawPixel(x + 1, y - 5, petalColor);
    drawPixel(x, y - 5, centerColor);
    drawPixel(x - 2, y - 4, petalColor);
    drawPixel(x + 2, y - 4, petalColor);
}

/**
 * Dibuja una Orquídea florecida
 */
function drawOrchid(x, y) {
    const petalColor = flowerConfig.orchid.colors.petal;
    const centerColor = flowerConfig.orchid.colors.center;
    const stemColor = flowerConfig.orchid.colors.stem;
    
    // Tallo
    drawPixel(x, y - 3, stemColor);
    drawPixel(x, y - 2, stemColor);
    drawPixel(x, y - 1, stemColor);
    drawPixel(x, y, stemColor);
    
    // Flor (forma asimétrica de orquídea)
    drawPixel(x, y - 4, petalColor);
    drawPixel(x - 1, y - 4, petalColor);
    drawPixel(x + 1, y - 4, centerColor);
    drawPixel(x - 1, y - 5, petalColor);
    drawPixel(x, y - 5, petalColor);
    drawPixel(x + 1, y - 5, petalColor);
    drawPixel(x + 2, y - 5, petalColor);
    drawPixel(x - 2, y - 4, petalColor);
}

/**
 * Calcula el ángulo de viento para una planta (animación idle)
 */
function getWindAngle(plant, time) {
    if (plant.state === 'seed' || plant.state === 'dead') return 0; // Las semillas o plantas muertas no se mueven
    // Las plantas mediana, capullo y flor se mueven más
    const windMultiplier = plant.state === 'flower' ? 1.5 : 
                          plant.state === 'bud' ? 1.2 : 1.0;
    
    // Cada planta tiene un offset único basado en su posición
    const plantOffset = (plant.x + plant.y) * 0.1;
    const windSpeed = plant.windSpeed || (2 + Math.random() * 1); // 2-3 grados
    const windPeriod = plant.windPeriod || (3 + Math.random() * 1); // 3-4 segundos
    
    // Oscilación suave usando seno
    return Math.sin((time * 0.001 + plantOffset) * (2 * Math.PI / windPeriod)) * windSpeed * windMultiplier;
}

/**
 * Obtiene el sprite correspondiente según el estado y tipo de planta
 */
function getPlantSprite(plant) {
    const typeKey = plant.type || 'common';
    switch (plant.state) {
        case 'seed':
            return getCachedSprite('common-seed', generateSeedSprite);
        case 'sprout':
            return getCachedSprite('common-sprout', generateSmallSproutSprite);
        case 'medium':
            return getCachedSprite(`${typeKey}-medium`, () => generateMediumPlantSprite(plant.type));
        case 'bud':
            return getCachedSprite(`${typeKey}-bud`, () => generateBudSprite(plant.type));
        case 'flower': {
            const generatorMap = {
                lily: generateLilyFlowerSprite,
                tulip: generateTulipFlowerSprite,
                orchid: generateOrchidFlowerSprite
            };
            const generator = generatorMap[plant.type] || generateLilyFlowerSprite;
            return getCachedSprite(`${typeKey}-flower`, generator);
        }
        case 'dead':
            return getCachedSprite(`${typeKey}-dead`, () => generateDeadSprite(plant.type));
        default:
            return getCachedSprite('common-seed', generateSeedSprite);
    }
}

/**
 * Dibuja una planta según su tipo y estado con animaciones (SISTEMA DE ALTA RESOLUCIÓN)
 */
function drawPlant(plant, time = 0) {
    // Guardar el estado del canvas
    ctx.save();
    
    // Aplicar transformaciones para animaciones
    const centerX = plant.x;
    const centerY = plant.y;
    const isAlive = plant.state !== 'dead';
    
    // Efecto de viento (solo para brotes y flores)
    if (isAlive && plant.state !== 'seed') {
        const windAngle = getWindAngle(plant, time);
        ctx.translate(centerX, centerY);
        ctx.rotate((windAngle * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);
    }
    
    // Efecto de rebote al regar
    if (isAlive && plant.bounceTime && plant.bounceTime > 0) {
        const bounceScale = 1 + Math.sin(plant.bounceTime * 20) * 0.1;
        ctx.translate(centerX, centerY);
        ctx.scale(bounceScale, bounceScale);
        ctx.translate(-centerX, -centerY);
        plant.bounceTime -= 0.05;
        if (plant.bounceTime <= 0) {
            plant.bounceTime = 0;
        }
    }
    
    // Efecto de destello al evolucionar
    if (isAlive && plant.evolving && plant.evolving > 0) {
        const flash = Math.abs(Math.sin(plant.evolving * 10));
        ctx.globalAlpha = 0.5 + flash * 0.5;
        plant.evolving -= 0.1;
        if (plant.evolving <= 0) {
            plant.evolving = 0;
        }
    }
    
    // Obtener y dibujar el sprite de alta resolución
    const sprite = getPlantSprite(plant);
    
    // Determinar la escala según el estado (las flores finales ocupan 60-70% de la altura)
    // Canvas height = 400px, queremos flores de ~250-280px
    // Sprite interno = 128px, necesitamos escala de ~2.0-2.2
    let scale = SPRITE_SCALE;
    if (plant.state === 'flower') {
        scale = 2.0; // Las flores finales ocupan ~256px (64% del canvas)
    } else if (plant.state === 'bud') {
        scale = SPRITE_SCALE * 1.2;
    } else if (plant.state === 'medium') {
        scale = SPRITE_SCALE * 0.8;
    } else if (plant.state === 'sprout') {
        scale = SPRITE_SCALE * 0.5;
    } else if (plant.state === 'dead') {
        scale = SPRITE_SCALE * 0.9;
    } else {
        scale = SPRITE_SCALE * 0.25; // Semilla muy pequeña
    }
    
    // Dibujar el sprite de alta resolución
    drawHighResSprite(sprite, centerX, centerY, scale);
    
    // Restaurar el estado del canvas
    ctx.restore();
    
    // Dibuja la barra de progreso de agua
    const stateIndex = plant.state === 'seed' ? 0 : 
                      plant.state === 'sprout' ? 1 :
                      plant.state === 'medium' ? 2 :
                      plant.state === 'bud' ? 3 : -1;
    
    if (stateIndex >= 0 && plant.water < plant.waterNeeded[stateIndex]) {
        const progressWidth = (plant.water / plant.waterNeeded[stateIndex]) * 40;
        const barX = plant.x - 20;
        const barY = plant.y - (plant.state === 'flower' ? 100 : 60);
        
        // Fondo de la barra
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barX, barY, 40, 6);
        
        // Barra de progreso
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(barX, barY, progressWidth, 6);
        
        // Borde
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, 40, 6);
    }
}

/**
 * Dibuja partículas de agua con estilo pixelado
 */
function drawWaterParticles() {
    // Iterar en reversa para poder eliminar elementos sin problemas
    for (let i = waterParticles.length - 1; i >= 0; i--) {
        const particle = waterParticles[i];
        
        ctx.save();
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = particle.color || '#87CEEB'; // Azul cielo para gotas
        ctx.imageSmoothingEnabled = false;
        
        // Dibujar gota pixelada (redondeada a píxeles enteros)
        const pixelSize = Math.max(2, Math.floor(particle.size / 2) * 2); // Tamaño par para pixelado
        const pixelX = Math.floor(particle.x - pixelSize/2);
        const pixelY = Math.floor(particle.y - pixelSize/2);
        
        ctx.fillRect(pixelX, pixelY, pixelSize, pixelSize);
        
        // Añadir brillo sutil
        if (pixelSize >= 4) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(pixelX, pixelY, Math.floor(pixelSize/2), Math.floor(pixelSize/2));
        }
        
        // Actualizar posición y opacidad
        particle.y += particle.velocity;
        particle.x += particle.horizontalVelocity || 0;
        particle.opacity -= 0.015;
        particle.size *= 0.99;
        
        // Eliminar partículas que ya no son visibles
        if (particle.opacity <= 0 || particle.y > CANVAS_HEIGHT || particle.size < 1) {
            waterParticles.splice(i, 1);
        }
        
        ctx.restore();
    }
}

/**
 * Crea partículas de agua en una posición con variaciones
 */
function createWaterParticles(x, y, count = 8, celebration = false) {
    const colors = celebration 
        ? ['#87CEEB', '#B0E0E6', '#ADD8E6', '#E0F6FF'] // Variedad de azules para celebración
        : ['#87CEEB', '#B0E0E6']; // Azules estándar para riego normal
    
    for (let i = 0; i < count; i++) {
        waterParticles.push({
            x: x + (Math.random() - 0.5) * (celebration ? 30 : 20),
            y: y - 10 + Math.random() * 10,
            velocity: (celebration ? 1.5 : 2) + Math.random() * (celebration ? 3 : 2),
            horizontalVelocity: (Math.random() - 0.5) * 0.5, // Movimiento horizontal sutil
            opacity: 0.7 + Math.random() * 0.3,
            size: (celebration ? 6 : 4) + Math.random() * (celebration ? 6 : 4),
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
}

/**
 * Renderiza todo el jardín con animaciones
 */
function render(currentTime = 0) {
    drawSoil();
    drawGrass();
    
    // Dibujar plantas con animaciones
    plants.forEach(plant => {
        drawPlant(plant, currentTime);
    });
    
    // Dibujar partículas de agua
    drawWaterParticles();
    
    // Dibujar nieve encima
    drawSnowOverlay();
    
    animationFrame++;
}

// ============================================
// LÓGICA DEL JUEGO
// ============================================

/**
 * Encuentra la planta en la posición del clic
 */
function findPlantAt(x, y) {
    return plants.find(plant => {
        const distance = Math.sqrt(
            Math.pow(plant.x - x, 2) + Math.pow(plant.y - y, 2)
        );
        return distance < PLANT_HITBOX_RADIUS; // Radio de detección
    });
}

/**
 * Evoluciona una planta al siguiente estado con efectos visuales (5 ETAPAS)
 */
function evolvePlant(plant) {
    let evolved = false;
    
    // Etapa 1 -> 2: Semilla -> Brote Pequeño
    if (plant.state === 'seed' && plant.water >= plant.waterNeeded[0]) {
        plant.state = 'sprout';
        plant.water = 0;
        plant.lifeStageStart = getTimestamp();
        evolved = true;
        // Inicializar propiedades de animación de viento
        if (!plant.windSpeed) {
            plant.windSpeed = 2 + Math.random() * 1;
            plant.windPeriod = 3 + Math.random() * 1;
        }
    }
    // Etapa 2 -> 3: Brote -> Planta Mediana
    else if (plant.state === 'sprout' && plant.water >= plant.waterNeeded[1]) {
        plant.state = 'medium';
        plant.water = 0;
        plant.lifeStageStart = getTimestamp();
        evolved = true;
    }
    // Etapa 3 -> 4: Planta Mediana -> Capullo
    else if (plant.state === 'medium' && plant.water >= plant.waterNeeded[2]) {
        plant.state = 'bud';
        plant.water = 0;
        plant.lifeStageStart = getTimestamp();
        evolved = true;
    }
    // Etapa 4 -> 5: Capullo -> Floración Gigante
    else if (plant.state === 'bud' && plant.water >= plant.waterNeeded[3]) {
        plant.state = 'flower';
        plant.water = 0;
        plant.lifeStageStart = getTimestamp();
        plant.timeInFlower = 0;
        evolved = true;
    }
    
    // Aplicar efecto de destello al evolucionar
    if (evolved) {
        plant.evolving = 1; // Duración del efecto de destello
    }
    
    return evolved;
}

/**
 * Maneja el clic en el canvas
 */
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (wateringCanActive) {
        // Modo regadera: regar la planta
        const plant = findPlantAt(x, y);
        if (plant && plant.state !== 'dead') {
            // Efecto de rebote
            plant.bounceTime = 0.3; // Duración del rebote
            
            // Crear partículas de agua
            createWaterParticles(x, y - 20, 10);
            
            // Incrementar agua y actualizar
            plant.water++;
            waterCount++;
            updateStats();
            
            // Verificar evolución
            const evolved = evolvePlant(plant);
            
            // Si evolucionó, crear más partículas de celebración
            if (evolved) {
                createWaterParticles(x, y - 30, 15, true);
            }
            
            // Renderizar inmediatamente para feedback visual
            const currentTime = Date.now();
            render(currentTime);
        }
    } else {
        // Modo plantación: plantar una semilla o limpiar planta muerta
        const existingPlant = findPlantAt(x, y);
        if (existingPlant && existingPlant.state === 'dead') {
            plants = plants.filter(p => p !== existingPlant);
            render(Date.now());
            return;
        }
        
        // Verificar que no haya otra planta cerca para plantar
        if (!existingPlant) {
            const plant = {
                x: x,
                y: y,
                type: selectedSeed,
                state: 'seed',
                water: 0,
                waterNeeded: [...flowerConfig[selectedSeed].waterNeeded],
                bounceTime: 0,
                evolving: 0,
                windSpeed: null,
                windPeriod: null,
                lifeStageStart: getTimestamp(),
                age: 0,
                timeInFlower: 0,
                freezeClock: 0
            };
            plants.push(plant);
            
            // Pequeño efecto visual al plantar
            createWaterParticles(x, y, 5);
            
            const currentTime = Date.now();
            render(currentTime);
        }
    }
});

// ============================================
// INTERFAZ DE USUARIO
// ============================================

/**
 * Actualiza las estadísticas en la UI
 */
function updateStats() {
    document.getElementById('water-count').textContent = waterCount;
    document.getElementById('day-count').textContent = dayCount;
}

/**
 * Inicializa los botones de semillas
 */
document.querySelectorAll('.seed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.seed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedSeed = btn.dataset.seed;
        wateringCanActive = false;
        document.getElementById('watering-can-btn').classList.remove('active');
    });
});

/**
 * Inicializa el botón de regadera
 */
document.getElementById('watering-can-btn').addEventListener('click', () => {
    wateringCanActive = !wateringCanActive;
    document.getElementById('watering-can-btn').classList.toggle('active');
    
    // Desactivar selección de semilla cuando se activa la regadera
    if (wateringCanActive) {
        document.querySelectorAll('.seed-btn').forEach(b => b.classList.remove('active'));
    }
});

/**
 * Dibuja los iconos de semillas en los botones
 */
function drawSeedIcons() {
    const seedIcons = {
        'seed-lily': 'lily',
        'seed-tulip': 'tulip',
        'seed-orchid': 'orchid'
    };
    
    Object.entries(seedIcons).forEach(([id, type]) => {
        const icon = document.getElementById(id);
        if (icon) {
            const iconCanvas = document.createElement('canvas');
            iconCanvas.width = 40;
            iconCanvas.height = 40;
            const iconCtx = iconCanvas.getContext('2d');
            
            // Escalar el dibujo para el icono
            const scale = 4;
            iconCtx.imageSmoothingEnabled = false;
            
            // Dibujar semilla pequeña
            iconCtx.fillStyle = '#654321';
            iconCtx.fillRect(16, 16, 8, 8);
            iconCtx.fillStyle = '#8B4513';
            iconCtx.fillRect(18, 18, 4, 4);
            
            icon.appendChild(iconCanvas);
        }
    });
}

// ============================================
// INICIALIZACIÓN
// ============================================

/**
 * Loop de animación principal
 */
function animate(currentTime) {
    if (!lastRenderTime) {
        lastRenderTime = currentTime;
    }
    const delta = currentTime - lastRenderTime;
    lastRenderTime = currentTime;
    
    updateWeather(delta);
    updateGrass(delta);
    updateSnow(delta);
    updatePlantLife(delta);
    
    // Renderizar con el tiempo actual para animaciones
    render(currentTime);
    
    // Continuar el loop de animación
    requestAnimationFrame(animate);
}

/**
 * Inicializa el juego
 */
function init() {
    drawSeedIcons();
    updateStats();
    
    // Generar pasto inicial
    for (let i = 0; i < 80; i++) {
        spawnGrassBlade();
    }
    
    // Iniciar loop de animación
    requestAnimationFrame(animate);
    
    // Simulación de días (opcional: avanzar días automáticamente)
    setInterval(() => {
        dayCount++;
        updateStats();
    }, 30000); // Cada 30 segundos = 1 día
}

// Inicia el juego cuando el DOM está listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

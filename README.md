# 🌱 Jardín Pixelado Interactivo

Un simulador de jardín estilo "pixel art" desarrollado con **HTML5 Canvas** y **JavaScript Puro (Vanilla JS)**. Este proyecto implementa un motor de renderizado personalizado sin dependencias externas.

## 🎮 Demo en Vivo
¡Juega aquí!: [https://lafarch.github.io/jardin-pixelado]

## ✨ Características Principales

* **Motor Gráfico Propio:** Los gráficos no son imágenes; son matrices de datos generadas procedurálmente y renderizadas en tiempo real en el Canvas.
* **Ciclo de Vida Biológico:** Sistema de crecimiento por etapas (Semilla → Brote → Floración) basado en interacciones (riego).
* **Sistema de Clima:** Simulación atmosférica con sistema de partículas para nieve y acumulación en superficies.
* **Física de Partículas:** Efectos visuales de agua y celebraciones con gravedad y desvanecimiento.
* **Animaciones Dinámicas:** Efecto de viento calculado trigonométricamente (función seno) para dar vida a las plantas.

## 🛠️ Tecnologías

* **Frontend:** HTML5, CSS3 (Grid/Flexbox).
* **Lógica:** JavaScript (ES6+), POO (Programación Orientada a Objetos).
* **Renderizado:** Canvas API con escalado de píxeles manual.

## 🚀 Instalación y Uso Local

1.  Clona el repositorio:
    ```bash
    git clone https://github.com/lafarch/jardin-pixelado.git
    ```
2.  Navega a la carpeta:
    ```bash
    cd jardin-pixelado
    ```
3.  Abre el archivo `index.html` en tu navegador favorito.

## 🧩 Estructura del Código

El núcleo del juego es el `Game Loop` dentro de `script.js`, que gestiona:
1.  **Update:** Actualiza lógica de clima, crecimiento y partículas.
2.  **Render:** Dibuja capa por capa (Suelo -> Pasto -> Plantas -> Clima).

---
Desarrollado con ❤️ por [lafarch](https://github.com/lafarch)
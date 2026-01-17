# ShadowForge: Client-Side Inverse Ray-Marching Compositor

ShadowForge is a high-performance React application that combines client-side computer vision models with a custom inverse rendering engine. It enables realistic subject integration by simulating physical light transport, variable penumbra (soft shadows), and geometric occlusion based on monocular depth estimation.

## Capabilities

* **Interactive Scene Graph:** Drag-and-drop positioning and scaling of subjects using bounding-box hit detection within the canvas context.
* **Physics-Based Rendering (PBR) approximations:**
    * **Directional Light:** Configurable Azimuth ($\theta$) and Elevation ($\phi$) angles.
    * **Variable Penumbra:** Simulates an area light source where shadow blur increases with distance from the occluder (contact hardening).
    * **Atmospheric Masking:** Automatically prevents shadows from casting on "infinite" depth pixels (sky/horizon).
* **Geometric Shadow Displacement:** Uses depth maps to act as a height field, allowing shadows to "drape" correctly over 3D obstacles (cars, walls, stairs) rather than projecting flatly.
* **Edge-Compute AI:** Runs segmentation and depth estimation entirely in the browser using ONNX Runtime Web (`@huggingface/transformers`).

---

## Mathematical Formulation

The rendering engine treats the shadow not as a Gaussian blur filter, but as a geometric projection of the subject onto a reconstructed 3D surface.

### 1. Affine Base Projection (Flat Surface)
To approximate the shadow on a planar ground ($z=0$), we construct a shear transformation matrix derived from the light vector.

Let $\phi$ be the light elevation angle ($0 < \phi < 90^\circ$) and $\theta$ be the azimuthal angle. The shadow length factor $K$ is inversely proportional to the tangent of the elevation:

$$K = \frac{1}{\tan(\phi)}$$

The 2D affine transformation matrix $M$ applied to the subject sprite is:

$$
M = \begin{bmatrix}
1 & 0 & -K \cos(\theta) \\
0 & -0.5 & -K \sin(\theta) \\
0 & 0 & 1
\end{bmatrix}
$$

*Note: The $Y$ scaling factor of $-0.5$ accounts for the perspective foreshortening of the ground plane and flips the sprite vertically relative to the contact point.*

### 2. Inverse Ray-Marching (Height Field Projection)
When a Depth Map is active, the engine treats the background image as a height field $H(x,y)$. We perform a simplified inverse ray-march to determine where a shadow ray intercepts the geometry.

For a given pixel $P(x,y)$ in the shadow buffer with a normalized depth value $d \in [0, 1]$ derived from the Neural Depth Estimator:

1.  **Height Reconstruction:** We estimate the physical height $h_{pixel}$ of the surface at $P$ relative to the subject's ground plane ($h_{ground}$):
    $$h_{pixel} = (d - h_{ground}) \cdot S_{depth}$$
    Where $S_{depth}$ is a user-defined scalar representing the maximum physical height in pixels.

2.  **Back-Projection Vector:**
    If $h_{pixel} > 0$ (the surface is a wall/obstacle), the shadow hitting this point must originate from a point closer to the light source in the flat projection. The displacement magnitude $\Delta$ is calculated via trigonometry:
    $$\Delta = \frac{h_{pixel}}{\tan(\phi)}$$

3.  **Source Sampling (inverse lookup):**
    We sample the flat shadow map at coordinate $P'(x', y')$:
    $$x' = x - (\cos(\theta) \cdot \Delta)$$
    $$y' = y - (\sin(\theta) \cdot \Delta)$$

This approximates the parallax effect of a shadow climbing a vertical surface.

### 3. Variable Penumbra (Area Light Simulation)
Real shadows exhibit "contact hardening"—they are sharp near the occluder and blurry at a distance. We approximate this using a distance-dependent convolution.

Let $r$ be the radial distance from the contact anchor point $(cx, cy)$. We generate two shadow layers:
1.  **Umbra Layer ($L_u$):** High opacity, low blur ($\sigma \approx 0$).
2.  **Penumbra Layer ($L_p$):** Low opacity, Gaussian blur with radius $R_{light}$.

The final pixel color $C_{final}$ is a lerp (linear interpolation) controlled by a radial gradient mask $M(r)$:

$$C_{final} = \text{lerp}(L_u, L_p, M(r))$$

Where $M(r)$ transitions from $0$ (sharp) to $1$ (blurry) as $r$ increases.

---

## The AI Pipeline

The application manages two concurrent inference sessions via WebGL acceleration:

### Pipeline A: Subject Segmentation
* **Model:** `briaai/RMBG-1.4`
* **Task:** Generates a binary alpha mask from the RGB input.
* **Post-Processing:** The tensor output is thresholded and applied as an alpha channel to the original image to create a movable "Cutout" asset.

### Pipeline B: Monocular Depth Estimation
* **Model:** `Xenova/depth-anything-small-hf`
* **Task:** Predicts relative distance from the camera for every pixel.
* **Preprocessing:** The raw tensor output is normalized using min-max scaling to maximize contrast for the physics engine:
    $$d_{norm} = \frac{d_{raw} - \min(d)}{\max(d) - \min(d)} \times 255$$

---

## Architecture

The application is built on **React + Vite** and avoids Web Workers for rendering to maintain zero-copy access to large Canvas buffers, optimizing for instantaneous interaction at 60 FPS.

* **`ShadowCompositor.tsx`**: The View layer. Handles UI state, file I/O, and DOM events.
* **`useShadowGenerator.ts`**: The Controller/Engine.
    * Maintains the Scene Graph (`x, y, scale`).
    * Manages the `CanvasRenderingContext2D` state.
    * Executes the pixel manipulation loops (Sky Masking, Bilinear Sampling) on the CPU.

## Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Run Development Server:**
    ```bash
    npm run dev
    ```
3.  **Usage:**
    * Upload a Subject image (Automatic background removal).
    * Upload a Background image (Automatic depth map generation).
    * Drag the subject to position it.
    * Adjust Light Angle and Depth Strength to match the scene geometry.
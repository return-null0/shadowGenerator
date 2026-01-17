# ShadowForge: AI-Powered Realistic Shadow Generator

ShadowForge is a client-side React application that combines computer vision AI models with a custom 2D rendering engine to create realistic, physics-based shadow composites for product photography and subject integration.



## 🏗️ Architecture Overview

The application uses an **Optimized Single-Threaded Architecture** to handle image processing and rendering directly within the React lifecycle.

### 1. The Rendering Loop (Main Thread)
* **Framework:** React + TypeScript + Vite.
* **AI Inference:** `@huggingface/transformers` (running locally in-browser via ONNX Runtime Web).
* **Optimization:** To maintain performance without a worker, the application extracts and caches raw pixel data (`Uint8ClampedArray`) from the Depth Map upon upload. This allows the render loop to perform pixel-level warping in real-time without expensive canvas reads every frame.

### 2. State Management
* **Role:** The `useShadowGenerator` hook acts as the central controller. It manages the AI model pipelines, handles file I/O, and executes the math for the shadow projection directly onto the HTML Canvas.

---

## 🧠 The AI Pipeline

### Pipeline A: Subject Extraction
We use **`briaai/RMBG-1.4`** to generate a binary alpha mask.
1.  **Input:** User uploads a raw photo (e.g., a person standing).
2.  **Inference:** The model outputs a probability map (tensor).
3.  **Post-Process:** We map the tensor to an Alpha Channel, creating a transparent PNG (the "Cutout").

### Pipeline B: Monocular Depth Estimation
We use **`Xenova/depth-anything-small-hf`** to understand the 3D geometry of the *background*.
1.  **Input:** The background image.
2.  **Inference:** The model predicts a relative depth value (0-255) for every pixel.
3.  **Output:** A grayscale heatmap where White = Near/High and Black = Far/Low. This is cached in RAM for the physics engine.

---

## 📐 Shadow Physics & Math

The shadow is not a simple blurred copy. It is a **projected affine transformation** based on directional light geometry.

### 1. Directional Projection (Shear Matrix)
We simulate a directional light source defined by an **Azimuth Angle ($\theta$)** and an **Elevation Angle ($\phi$)**.

The length of a shadow ($L$) cast by an object of height $h$ is determined by the elevation:

$$L = \frac{h}{\tan(\phi)}$$

To project the 2D cutout onto the "floor", we calculate a **Shear Transformation Matrix**.
Given the shadow length factor $K = 1 / \tan(\phi)$:

* **Shear X:** $S_x = -K \cdot \cos(\theta)$
* **Shear Y:** $S_y = -K \cdot \sin(\theta)$

The canvas transformation matrix applied is:

$$
\begin{bmatrix}
1 & 0 & S_x \\
0 & -0.5 & S_y \\
0 & 0 & 1
\end{bmatrix}
$$

*Note: The Y-scale is set to -0.5 to flip the image upside down (shadows fall away from feet) and squash it to simulate perspective on a ground plane.*

### 2. Contact Shadow Gradient
Real shadows are darker near the contact point (occlusion) and lighter further away. We simulate this using a linear gradient mask along the shadow vector.

* **Start Point:** The subject's "feet" (Pivot X, Pivot Y).
* **End Point:** Calculated using trigonometry:

$$End_x = Pivot_x + \cos(\theta) \cdot (h \cdot K)$$
$$End_y = Pivot_y + \sin(\theta) \cdot (h \cdot K)$$

### 3. Depth Warping (The "Bonus" Mode)
To make the shadow "drape" over uneven terrain (like cobblestones), we apply a **pixel displacement algorithm** during the render pass.

For every pixel $P(x,y)$ in the shadow buffer:
1.  We look up the **Depth Value** ($D$) from the cached depth array at $(x,y)$.
2.  We calculate a displacement vector based on the light direction:
    $$Shift = \frac{D}{255} \cdot Strength$$
3.  We sample the source pixel from "upstream" (towards the light source):
    $$Source_x = x - (\cos(\theta) \cdot Shift)$$
    $$Source_y = y - (\sin(\theta) \cdot Shift)$$

This shifts the shadow pixels "forward" where the ground is high (white), creating the illusion that the shadow is hitting the obstacle earlier.

---

## 🛠️ Project Structure

* **`src/ShadowCompositor.tsx`**: The main React component (View). Handles the UI layout, file inputs, and debug export buttons.
* **`src/useShadowGenerator.ts`**: Custom Hook (Controller & Engine). Manages the render loop, executes the physics math, handles file upload logic, and runs the AI pipelines.
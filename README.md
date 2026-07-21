# BroMetal

Write TypeScript.  Lift Shaders.  Skip leg day.

BroMetal is LLVM-inspired compiler infrastructure for GPU programming that transforms TypeScript into highly optimized GPU shaders for WebGL, WebGPU, DirectX, and Metal.

```mermaid
flowchart TD
    TS[TypeScript] --> Parser
    Parser --> TC[Type Checker]
    TC --> SA[GPU Semantic Analysis]
    SA --> IR[GPU IR]
    IR --> OPT[Optimization Passes]
    OPT --> GLSL --> WebGL
    OPT --> WGSL --> WebGPU
    OPT --> HLSL --> DirectX
    OPT --> MSL --> Metal
```
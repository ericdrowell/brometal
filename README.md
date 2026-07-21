# BroMetal

Write TypeScript.  Lift Shaders.  Skip leg day.

BroMetal is an LLVM-inspired compiler that transforms TypeScript into highly optimized GPU shaders for WebGL and WebGPU. Write GPU code in TypeScript, compile to portable GLSL and WGSL, and eliminate shader boilerplate.

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
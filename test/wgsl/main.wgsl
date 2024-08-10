// #if typedef
fn chunkFn() {}
// #endif
// #module main
// #import chunkFn from ./chunk0
struct OutputData {
  gars: f32,
  frags: i32,
}
override blue = 3;
@group(0) @binding(2) var<storage,read_write> fgg: array<OutputData,blue>;
@vertex
// #export
fn mainVert(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
    let position = array(
        vec2f(0.0, 1.0),
        vec2f(1.0, 1.0),
        vec2f(0.0, 0.0),
        vec2f(0.0, 0.0),
        vec2f(1.0, 0.0),
        vec2f(1.0, 1.0)
    );

    let coords = position[index];
    let z = chunkFn();
    return vec4f(coords * 2 - 1, 0, 1);
}

override red = 0u;
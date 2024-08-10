// src/vite.ts
import { ModuleRegistry } from "wgsl-linker";
import * as msd from "webgpu-utils";
import { globSync } from "glob";
import { readFileSync } from "node:fs";
var DEFAULT_EXTENSION = "glsl";
var DEFAULT_SHADERS = Object.freeze(["**/*.wgsl"]);
function wgsl({
  include = DEFAULT_SHADERS,
  exclude = void 0,
  warnDuplicatedImports = true,
  defaultExtension = DEFAULT_EXTENSION,
  compress = false,
  watch = true,
  root = "/"
} = {}) {
  let server, config;
  const prod = process.env.NODE_ENV === "production";
  const filter = /.+\.wgsl/;
  return {
    enforce: "pre",
    name: "vite-plugin-glsl",
    configureServer(devServer) {
      server = devServer;
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    transform(source, shader, ...other) {
      if (!filter.test(shader)) return;
      globalThis.GPUShaderStage = {
        VERTEX: 1,
        FRAGMENT: 2,
        COMPUTE: 4
      };
      const files = globSync([...include, "!node_modules"].filter(Boolean), {
        ignore: exclude,
        absolute: true
      });
      const fileMap = {};
      for (const file of files) {
        fileMap[file] = readFileSync(file, "utf8");
      }
      const registary = new ModuleRegistry({
        wgsl: fileMap
      });
      registary._parseSrc({});
      const resp = registary.findTextModule(shader.replace(/^\//, ""));
      if (!resp) {
        throw Error(`no wgsl file found with the path of ${shader}`);
      }
      const m = registary.link(resp.name);
      const outputShader = m;
      console.log({ outputShader });
      if (!filter.test(shader)) return;
      globalThis.GPUShaderStage = {
        VERTEX: 1,
        FRAGMENT: 2,
        COMPUTE: 4
      };
      const makeShaderDataDefinitions2 = msd.makeShaderDataDefinitions;
      const definitions = makeShaderDataDefinitions2(
        outputShader.replace(/(^|\s)override/g, "const")
      );
      return {
        code: `export const code = \`${outputShader}\`;

export const definitions = ${JSON.stringify(
          definitions
        )};

export default code`,
        map: null,
        data: {
          code: outputShader,
          definitions
        }
      };
    }
  };
}
var vite_default = wgsl;

export {
  wgsl,
  vite_default
};
/**
 * @module vite-plugin-glsl
 * @author Ustym Ukhman <ustym.ukhman@gmail.com>
 * @description Import, inline (and compress) GLSL shader files
 * @version 1.2.1
 * @license MIT
 */

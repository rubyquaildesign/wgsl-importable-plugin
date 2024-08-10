/**
 * @function
 * @name wgsl
 * @description Plugin entry point to import,
 * inline, (and compress) WGSL shader files
 *
 * @see {@link https://vitejs.dev/guide/api-plugin.html}
 * @link https://github.com/UstymUkhman/vite-plugin-glsl
 *
 * @param {PluginOptions} options Plugin config object
 *
 * @returns {Plugin} Vite plugin that converts shader code
 */
declare function wgsl({ include, exclude, warnDuplicatedImports, defaultExtension, compress, watch, root, }?: {
    include?: string[] | undefined;
    exclude?: undefined;
    warnDuplicatedImports?: boolean | undefined;
    defaultExtension?: string | undefined;
    compress?: boolean | undefined;
    watch?: boolean | undefined;
    root?: string | undefined;
}): Plugin;
export { wgsl as default, wgsl };

/**
 * dsh-session-monitor — Host half.
 *
 * Pure UI plugin: the empty apply exists only so the plugin appears in the
 * host cordis roster (load and lifecycle follow the host). The browser half
 * ships via exports["./client"], discovered through the package.json
 * `dsh.client` declaration. There is no host-side behavior, no route, and no
 * session/workspace mutation.
 */
function apply() {}

export { apply };

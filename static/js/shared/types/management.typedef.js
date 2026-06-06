/*
 * JSDoc typedefs for config-driven management pages.
 * These comments provide editor hints without adding a build step.
 */

/**
 * @typedef {Object} BlossomColumnConfig
 * @property {string} key
 * @property {string} label
 * @property {boolean=} searchable
 * @property {function(Object,Object):string=} render
 */

/**
 * @typedef {Object} BlossomFieldConfig
 * @property {string} key
 * @property {string} label
 * @property {string=} type
 * @property {boolean=} required
 * @property {boolean=} searchable
 * @property {string=} optionsSource
 * @property {Array=} options
 * @property {function(string,Object):string=} validate
 */

/**
 * @typedef {Object} BlossomManagementConfig
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} rowKey
 * @property {Array<BlossomColumnConfig>} columns
 * @property {Object} actions
 * @property {Array=} statistics
 */

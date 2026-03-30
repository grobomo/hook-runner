#!/usr/bin/env node
"use strict";
/**
 * Async module execution helper for hook-runner.
 *
 * Detects whether a module returns a Promise (thenable) and awaits it
 * with a per-module timeout. Sync modules pass through unchanged.
 *
 * Usage:
 *   var runAsync = require("./run-async");
 *   runAsync(modules, input, EVENT, handleResult, handleDone);
 */

var DEFAULT_TIMEOUT = 4000; // 4s per module (Claude Code hook timeout is 5s)

/**
 * Check if a value is a thenable (Promise-like).
 */
function isThenable(val) {
  return val && typeof val === "object" && typeof val.then === "function";
}

/**
 * Wrap a Promise with a timeout. Rejects if the promise doesn't resolve
 * within `ms` milliseconds.
 */
function withTimeout(promise, ms, label) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      reject(new Error("async timeout (" + ms + "ms) for " + label));
    }, ms);
    promise.then(
      function (val) { clearTimeout(timer); resolve(val); },
      function (err) { clearTimeout(timer); reject(err); }
    );
  });
}

/**
 * Run modules sequentially, supporting both sync and async.
 *
 * @param {string[]} modulePaths - array of absolute paths to module files
 * @param {object} input - parsed hook input
 * @param {function} handleResult - called with (modName, result) for each module.
 *   Return true to stop iteration (first-block-wins).
 * @param {function} handleDone - called when all modules have run
 * @param {number} [timeout] - per-module timeout in ms (default 4000)
 */
function runModules(modulePaths, input, handleResult, handleDone, timeout) {
  timeout = timeout || DEFAULT_TIMEOUT;
  var hasAsync = false;
  var i = 0;

  function next() {
    if (i >= modulePaths.length) {
      handleDone();
      return;
    }

    var modPath = modulePaths[i];
    var path = require("path");
    var modName = path.basename(modPath, ".js");
    i++;

    try {
      var mod = require(modPath);
      var result = mod(input);

      if (isThenable(result)) {
        // Async module — await with timeout
        hasAsync = true;
        withTimeout(result, timeout, modName).then(
          function (val) {
            if (handleResult(modName, val)) return; // stopped
            next();
          },
          function (err) {
            handleResult(modName, null, err);
            next();
          }
        );
      } else {
        // Sync module — process immediately
        if (handleResult(modName, result)) return; // stopped
        next();
      }
    } catch (e) {
      handleResult(modName, null, e);
      next();
    }
  }

  next();
}

module.exports = { runModules: runModules, isThenable: isThenable, withTimeout: withTimeout, DEFAULT_TIMEOUT: DEFAULT_TIMEOUT };

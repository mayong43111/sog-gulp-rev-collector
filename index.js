'use strict';
var _ = require('underscore');
var gutil = require('gulp-util');
var PluginError = gutil.PluginError;
var through = require('through2');
var path = require('path');
var gulp = require('gulp');
var escapeStringRegexp = require('escape-string-regexp');

var PLUGIN_NAME = 'sog-gulp-rev-collector';

var defaults = {
};

function _getManifestData(file, opts) {
    var data;
    var ext = path.extname(file.path);
    if (ext === '.json') {
        var json = {};
        try {
            var content = file.contents.toString('utf8');
            if (content) {
                json = JSON.parse(content);
            }
        } catch (x) {
            this.emit('error', new PluginError(PLUGIN_NAME, x));
            return;
        }
        if (_.isObject(json)) {
            data = json;
        }

    }
    return data;
}

function closeDirBySep(dirname) {
    return dirname + (!dirname || new RegExp(escPathPattern('/') + '$').test(dirname) ? '' : '/');
}

function revCollector(manifestPath, opts) {
    opts = _.defaults((opts || {}), defaults);

    manifestPath = manifestPath || [];

    if (typeof manifestPath === 'string') {
        manifestPath = [manifestPath];
    }

    var manifest = {};
    var mutables = [];

    gulp.src(manifestPath)
        .pipe(through.obj(function (file, enc, cb) {
            var mData = _getManifestData(file, opts);
            if (mData) {
                _.extend(manifest, mData);
            }
            cb();
        }, function (cb) {
            cb();
        }));

    return through.obj(function (file, enc, cb) {

        mutables.push(file);
        cb();
    }, function (cb) {
        var changes = [];
        var dirReplacements = [];
        if (_.isObject(opts.dirReplacements)) {
            Object.keys(opts.dirReplacements).forEach(function (srcDirname) {
                dirReplacements.push({
                    dirRX: escPathPattern(closeDirBySep(srcDirname)),
                    dirRpl: opts.dirReplacements[srcDirname]
                });
            });
        }

        for (var key in manifest) {
            var pattern = '(["\'!\\s]+(?:\\.\\/|\\/)?(?:\\.\\.\\/)*)' + escapeStringRegexp(key) + '(["\'\\s]+)';

            changes.push({
                regexp: new RegExp(pattern, 'g'),
                patternLength: pattern.length,
                replacement: '$1' + manifest[key] + '$2'
            });

            if (path.extname(key) === '.js') {

                var requireKey = key.replace(new RegExp(escapeStringRegexp('.js') + '$'), '');
                var requireVal = manifest[key].replace(new RegExp(escapeStringRegexp('.js') + '$'), '');

                var requirePattern = '(["\'!\\s]+(?:\\.\\/|\\/)?(?:\\.\\.\\/)*)' + escapeStringRegexp(requireKey) + '(["\'\\s]+)';

                changes.push({
                    regexp: new RegExp(requirePattern, 'g'),
                    patternLength: requirePattern.length,
                    replacement: '$1' + requireVal + '$2'
                });
            }

        }

        // Replace longer patterns first
        // e.g. match `script.js.map` before `script.js`
        changes.sort(
            function (a, b) {
                return b.patternLength - a.patternLength;
            }
        );
        mutables.forEach(function (file) {
            if (!file.isNull()) {
                var src = file.contents.toString('utf8');
                changes.forEach(function (r) {
                    src = src.replace(r.regexp, r.replacement);
                });
                file.contents = new Buffer(src);
            }
            this.push(file);
        }, this);

        cb();
    });
}

module.exports = revCollector;

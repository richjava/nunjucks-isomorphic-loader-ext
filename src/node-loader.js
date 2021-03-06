var fs = require('fs');
var path = require('path');
var utils = require('loader-utils');
var nunjucks = require('nunjucks');
var fsLoader = require('./fs-loader');

function getConfig(that, name) {
	var config;
	configPath = require.resolve(path.resolve(process.cwd(), name));
	if ( configPath ) {
		try {
			var data = fs.readFileSync(configPath, 'utf8');
			config = that.exec(data, name);
			if ( config ) {
				that.addDependency(configPath);
			}
			return config;
		} catch (e) {
			throw new Error(e);
		}
	}
}

function getRootPath(rootPaths, lookUp) {
	const contains = rootPaths.filter(opt => lookUp.indexOf(opt) === 0)

	return  contains.reduce((acc, item) => {
		if (!acc) { return item; }

		return item.length > acc.length ? item : acc;
	}, null);
}

module.exports = function(source) {
	var opt = utils.getOptions(this);
	var paths = Array.isArray(opt.root) ? opt.root : [opt.root];
	var context;
	const rootPath = getRootPath(paths, this.resourcePath);

	if ( typeof opt.context === "string" ) {
		context = getConfig(this, opt.context);
	}

	context = JSON.stringify(context || opt.context || {});

	var njkPath = require.resolve('nunjucks');
	this.addDependency(njkPath);

	var loaderPath = require.resolve('./fs-loader');
	this.addDependency(loaderPath);

	var njkSlimPath = require.resolve('nunjucks/browser/nunjucks-slim');
	var nunjucksSlim = utils.stringifyRequest(this, '!' + njkSlimPath);
	this.addDependency(njkSlimPath);

	var env = new nunjucks.Environment(new fsLoader(paths, this.addDependency));

	//replace back slashes in path with forward slashes
	var name = path.relative(paths[0], this.resourcePath).replace(/\\/g,"/");

	this.addContextDependency(rootPath);

	var precompiledTemplates = nunjucks.precompile(rootPath, {
		env: env,
		include: [/.*\.(njk|nunjucks|html|tpl|tmpl)$/]
	});

  	return `// Return function to HtmlWebpackPlugin
		// Allows Data var to be passed to templates
		// Then render templates with both HtmlWebpackPlugin Data
		// and Nunjucks Context
		var nunjucks = require(${nunjucksSlim});

		// Create fake window object to store nunjucks precompiled templates
		global.window = {};

		${precompiledTemplates}

		var env = new nunjucks.Environment(new nunjucks.PrecompiledLoader());
		
		env.addGlobal('toDate', function(date) {
			return date ? new Date(date) : new Date();
		});

		env.addFilter('date', function (datetime) {
			if(!datetime) return;
			var d = new Date(datetime); 
			return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toLocaleDateString('en-US', {
				weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
			});
		  });
		  
		var context = JSON.parse('${context}');

		module.exports = env.render("${name}", context);

		module.exports = function(data) {
			return env.render("${name}", Object.assign({}, context, data));
		}`
}

import { Class, clone, isObject, isArray } from 'orbit/lib/objects';

var Options = Class.extend({
	init: function(optionsHash){
    this.include = optionsHash.include;
	},

  currentIncludes: function(){
    return Object.keys(this.include||{});
  },

  forLink: function(link){
    var linkOptions = clone(this);
    linkOptions.include = this.include[link];
    return new Options(linkOptions);
  },

  addInclude: function(link){
    if(!link) throw new Error("link not specified");
    var options = clone(this);
    if(!options.include) options.include = {};
    options.include[link] = {};
    return new Options(options);
  }
});

function buildOptions(optionsHash){
  if(optionsHash instanceof Options) return optionsHash;

  optionsHash = optionsHash || {};
  var include = parseInclude(optionsHash.include);

  return new Options({include: include});
}

function parseInclude(include){
  if (!include) return undefined;
  if (!isArray(include)) {
    include = [include];
  }

  var parsed = {};

  include.forEach(function(inclusion){
    var current = parsed;
    inclusion.split(".").forEach(function(link){
      current[link] = current[link] || {};
      current = current[link];
    });
  });

  return parsed;
}

export { buildOptions };

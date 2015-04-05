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

  var parsed = {};

  if(!include.forEach) debugger;
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

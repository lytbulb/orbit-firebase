import { Class, clone } from 'orbit/lib/objects';

var Options = Class.extend({
	init: function(optionsHash){
    this.include = optionsHash.include;
	},

  currentIncludes: function(){
    console.log("currentIncludes", Object.keys(this.include));
    return Object.keys(this.include);
  },

  forLink: function(link){
    var linkOptions = clone(this);
    linkOptions.include = this.include[link];
    return new Options(linkOptions);
  }
});

function buildOptions(optionsHash){
  var include = parseInclude(optionsHash.include);

  return new Options({include: include});
}

function parseInclude(include){
  if (!include) return undefined;

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

export { Options, buildOptions };

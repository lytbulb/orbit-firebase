import { Class } from 'orbit/lib/objects';

export default Class.extend({
	init: function(schema){
		this.schema = schema;
	},

	lookupLinkDef: function(model, link){
		var modelSchema = this.schema.models[model];
		if(!modelSchema) throw new Error("Could not find model for " + model);
		var linkDef = modelSchema.links[link];
		if(!linkDef) throw new Error("Could not find type for " + model + "/" + link);
		return linkDef;
	},

	lookupRelatedLinkDef: function(model, link){
		var linkDef = this.lookupLinkDef(model, link);
		return this.schema.models[linkDef.model].links[linkDef.inverse];
	},

	linkTypeFor: function(model, link){
		return this.lookupLinkDef(model, link).type;
	},

	modelTypeFor: function(model, link){
		return this.lookupLinkDef(model, link).model;
	},

	modelSchema: function(type){
		var modelSchema = this.schema.models[type];
		if(!modelSchema) throw new Error("No model found for " + type);
		return modelSchema;
	},

	linksFor: function(model){
		return Object.keys(this.modelSchema(model).links);
	},

	inverseLinkFor: function(model, link){
		return this.lookupLinkDef(model, link).inverse;
	}
});

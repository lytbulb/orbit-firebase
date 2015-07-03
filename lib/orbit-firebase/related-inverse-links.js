import OC from 'orbit-common/main';
import { Class } from 'orbit/lib/objects';
import OperationMatcher from './operation-matcher';
import Operation from 'orbit/operation';
import OperationEncoder from 'orbit-common/operation-encoder';
import { coalesceOperations } from 'orbit/lib/operations';

function asHash(k,v){
  var hash = {};
  hash[k] = v;
  return hash;
}

function buildObject(keys, value){
	var hash = {};
	keys.forEach(function(key){
		hash[key] = value;
	});
	return hash;
}

var SchemaUtils = Class.extend({
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

var ChangeDetails = Class.extend({
	init: function(path, value, schema, cache){
		this.path = path;
		this.value = value;
		this.schema = schema;
		this.schemaUtils = new SchemaUtils(schema);
		this.cache = cache;
	},

	model: function(){
		return this.path[0];
	},

	modelId: function(){
		return this.path[1];
	},

	link: function(){
		return this.path[3];
	},

	currentValue: function(){
		return this.cache.retrieve(this.path);
	},

	linkDef: function(){
		return this.schemaUtils.lookupLinkDef(this.model(), this.link());
	},

	originalInversePath: function(){
		return [this.linkDef().model, this.currentValue(), "__rel", this.linkDef().inverse];
	},

	inverseLinkDef: function(){
		return this.schemaUtils.lookupRelatedLinkDef(this.model(), this.link());
	},

	newInversePath: function(){
		return [this.linkDef().model, this.value, "__rel", this.linkDef().inverse];
	}
});

var RelationshipResolver = Class.extend({
	init: function(schema, cache, initializeLinks){
		this.visited = [];
		this.schema = schema;
		this.schemaUtils = new SchemaUtils(schema);
		this.cache = cache;
		this.operations = [];
		this.initializeLinks = initializeLinks;
	},

	visit: function(op, path, value){
		if(this.hasVisited(path)) return;
		if(!this.initializeLinks && this.isUninitialized(path)) return;
		this.markVisited(path);

		var linkType = this.schemaUtils.linkTypeFor(path[0], path[3]);

		if(!path[1]) throw new Error("invalid modelId: " + op + "|" + path + "|" + value);

		this[linkType][op].call(this, path, value);
	},

	hasVisited: function(path){
		return this.visited.indexOf(path.join("/")) !== -1;
	},

	markVisited: function(path){
		this.visited.push(path.join("/"));
	},

	isUninitialized: function(path){
		return this.cache.retrieve(path) === OC.LINK_NOT_INITIALIZED;
	},

	hasOne: {
		add: function(path, value){
			var changeDetails = new ChangeDetails(path, value, this.schema, this.cache);

			this.operations.push(new Operation({ op: 'add', path: changeDetails.path, value: changeDetails.value }));
			if(changeDetails.currentValue()){
				this.visit("remove", changeDetails.originalInversePath(), changeDetails.modelId());
			}
			this.visit("add", changeDetails.newInversePath(), changeDetails.modelId());
		},

		remove: function(path, value){
			var changeDetails = new ChangeDetails(path, value, this.schema, this.cache);
			if(!value) return;
			this.operations.push(new Operation({ op: 'remove', path: changeDetails.path}));
			if(changeDetails.currentValue()){
				this.visit("remove", changeDetails.originalInversePath(), changeDetails.modelId());
			}
		},

		replace: function(path, value){
			var changeDetails = new ChangeDetails(path, value, this.schema, this.cache);

			this.operations.push(new Operation({ op: 'replace', path: changeDetails.path, value: changeDetails.value }));
			if(changeDetails.currentValue()){
				this.visit("remove", changeDetails.originalInversePath(), changeDetails.modelId());
			}
			this.visit("add", changeDetails.newInversePath(), changeDetails.modelId());
		}
	},

	hasMany: {
		add: function(path, value){

			var linkDef = this.schemaUtils.lookupLinkDef(path[0], path[3]);
			var inversePath = [linkDef.model, value, "__rel", linkDef.inverse];

			this.operations.push(new Operation({ op: 'add', path: path.concat(value), value: true }));
			this.visit("add", inversePath, path[1]);
		},

		remove: function(path, value){
			var linkDef = this.schemaUtils.lookupLinkDef(path[0], path[3]);
			var inversePath = [linkDef.model, value, "__rel", linkDef.inverse];
			this.operations.push(new Operation({ op: 'remove', path: path.concat(value) }));
			this.visit("remove", inversePath, path[1]);
		},

		replace: function(path, value){
			var _this = this,
				relatedLinkDef = this.schemaUtils.lookupRelatedLinkDef(path[0], path[3]);

			this.operations.push(new Operation({ op: 'replace', path: path, value: buildObject(value, true) }));

			var linkValue = this.cache.retrieve(path);
			var currentValue = linkValue ? Object.keys(linkValue) : [];
			var modelId = path[1];
			var linkDef = this.schemaUtils.lookupLinkDef(path[0], path[3]);

			var added = value.filter(function(id){
				return currentValue.indexOf(id) === -1;
			});

			var removed = currentValue.filter(function(id){
				return value.indexOf(id) === -1;
			});

			added.forEach(function(id){
				var inversePath = [linkDef.model, id, "__rel", linkDef.inverse];
				_this.visit("add", inversePath, modelId);
			});

			removed.forEach(function(id){
				var inversePath = [linkDef.model, id, "__rel", linkDef.inverse];
				_this.visit("remove", inversePath, modelId);
			});
		}
	}
});

export default Class.extend({
	init: function(schema, cache){
		this.schema = schema;
		this.schemaUtils = new SchemaUtils(schema);
		this.cache = cache;
		this._operationEncoder = new OperationEncoder(schema);
	},

	process: function(operation){
		if(operation.path[2] === "__rel") return this.relatedLinkOperations(operation, false);
		if(operation.path.length === 2) return this.relatedRecordOperations(operation);
		return [];
	},

	relatedRecordOperations: function(operation){
		var _this = this;
		var model = operation.path[0];
		var recordId = operation.path[1];
		var record = this.cache.retrieve([model, recordId]) || operation.value;
		if(!record) throw new Error("record not found ", [model, recordId].join("/"));

		var ops = [operation];



		var linkOps;

		this.schemaUtils.linksFor(model).forEach(function(link){
			var linkValue = record.__rel[link];
			if(linkValue){
				var linkOperation = {op: operation.op, path: [model, recordId, '__rel', link], value: linkValue};
				linkOps = _this.relatedLinkOperations(linkOperation, true);
				linkOps.forEach(function(linkOp){
					ops.push(linkOp);
				});
			}
		});

		console.log("ops", ops);
		var coalesced = coalesceOperations(ops);
		var sorted = this.sortedByPathLength(coalesced);

		return sorted;
	},

	relatedLinkOperations: function(operation, initializeLinks){
		var relationshipResolver = new RelationshipResolver(this.schema, this.cache, initializeLinks);
		var normalized = this.normalize(operation);
		relationshipResolver.visit(normalized.op, normalized.path, normalized.value);
		var linkOps = relationshipResolver.operations;
		var sorted = this.sortedByOp(linkOps);

		return sorted;
	},

	sortedByPathLength: function(operations){
		return operations.sort(function(a, b){
			return a.path.length > b.path.length;
		});
	},

	sortedByOp: function(operations){
		var operationSortKey = this.operationSortKey;

		return operations.sort(function(a, b){
			console.log(a.serialize(), operationSortKey(a));
			return operationSortKey(a) > operationSortKey(b);
		});
	},

	operationSortKey: function(operation){
		var opOrder = ['remove', 'add', 'replace'];
		return opOrder.indexOf(operation.op);
	},

	normalize: function(operation){
		var linkDef = this.schemaUtils.lookupLinkDef(operation.path[0], operation.path[3]);
		var path = operation.path;
		var operationType = this._operationEncoder.identify(operation);

		if(operationType === 'addHasMany'){
			return {
				op: 'replace',
				path: operation.path,
				value: Object.keys(operation.value)
			};
		}

		if(operationType === 'removeHasMany'){
			return {
				op: 'replace',
				path: operation.path,
				value: []
			};
		}

		if(["hasMany", "hasOne"].indexOf(linkDef.type) === -1) throw new Error("unsupported link type: " + linkDef.type);

		if(linkDef.type === "hasOne" && operation.op === "add") return operation;
		if(linkDef.type === "hasOne" && operation.op === "remove"){
			return {
				op: operation.op,
				path: path,
				value: this.cache.retrieve(path)
			};
		}
		if(linkDef.type === "hasMany" && (['add', 'remove'].indexOf(operation.op) !== -1)) {
			return {
				op: operation.op,
				path: path.slice(0,-1),
				value: path[path.length-1]
			};
		}
		if(linkDef.type === "hasMany" && operation.op === "replace"){
			return {
				op: operation.op,
				path: operation.path,
				value: Object.keys(operation.value)
			};
		}

		return operation;
	}
});

import { Class } from 'orbit/lib/objects';
import { objectValues } from 'orbit-firebase/lib/object-utils';
import { map } from 'orbit-firebase/lib/array-utils';
import SchemaUtils from 'orbit-firebase/lib/schema-utils';
import Orbit from 'orbit/main';
import { assert } from 'orbit/lib/assert';
import { isArray } from 'orbit/lib/objects';
import { RecordNotFoundException } from 'orbit-common/lib/exceptions';

export default Class.extend({
	init: function(firebaseClient, schema, serializer){
		assert('FirebaseSource requires Orbit.map be defined', Orbit.map);

		this._firebaseClient = firebaseClient;
		this._schema = schema;
		this._schemaUtils = new SchemaUtils(schema);
		this._serializer = serializer;
	},

	find: function(type, id){
		if(id){
			if(isArray(id)) return this._findMany(type, id);
			return this._findOne(type, id);
		}
		else {
			return this._findAll(type);
		}
	},

	findLink: function(type, id, link){
		var linkType = this._schemaUtils.lookupLinkDef(type, link).type;
		return this._firebaseClient.valueAt([type, id, link]).then(function(linkValue){
			if(linkType === 'hasMany') {
				return linkValue ? Object.keys(linkValue) : [];
			}
			else if(linkType === 'hasOne') {
				return linkValue;
			}
			throw new Error("Links of type " + linkType + " not handled");
		});
	},

	findLinked: function(type, id, link){
		var linkType = this._schemaUtils.lookupLinkDef(type, link).type;
		if(linkType === 'hasMany') {
			return this._findLinkedHasMany(type, id, link);
		}
		else if(linkType === 'hasOne') {
			return this._findLinkedHasOne(type, id, link);
		}
		throw new Error("Links of type " + linkType + " not handled");
	},

	_findOne: function(type, id){
		var _this = this;

		return _this._firebaseClient.valueAt([type, id]).then(function(record){
			// todo - is this the correct behaviour for not found?
			if(!record) throw new RecordNotFoundException(type + ":" + id);
			return _this._serializer.deserialize(type, id, record);
		});
	},

	_findMany: function(type, ids){
		var _this = this;
		var promises = map(ids, function(id){
			return _this._findOne(type, id);
		});

		return Orbit.all(promises);
	},

	_findAll: function(type){
		var _this = this;
		return _this._firebaseClient.valueAt(type).then(function(recordsHash){
			var records = objectValues(recordsHash);
			console.log("findAll results for: " + type, records);
			return _this._serializer.deserializeRecords(type, records);
		});
	},

	_findLinkedHasMany: function(type, id, link){
		console.log("fb._findLinkedHasMany", arguments);
		var _this = this;
		var linkDef = this._schemaUtils.lookupLinkDef(type, link);
		var model = linkDef.model;

		return this.findLink(type, id, link).then(function(ids){
			console.log("fb.findLink => ", ids);
			var promised = [];
			for(var i = 0; i < ids.length; i++){
				promised[i] = _this._firebaseClient.valueAt([model, ids[i]]);
			}

			return Orbit.map(promised, function(record){
				return _this._serializer.deserialize(model, record.id, record);
			});
		});
	},

	_findLinkedHasOne: function(type, id, link){
		var _this = this;
		var linkDef = this._schemaUtils.lookupLinkDef(type, link);
		var model = linkDef.model;

		return this.findLink(type, id, link).then(function(id){
			return _this._firebaseClient.valueAt([model, id]).then(function(serializedRecord){
				return _this._serializer.deserialize(model, id, serializedRecord);
			});
		});
	}
});

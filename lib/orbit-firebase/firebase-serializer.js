import Serializer from 'orbit-common/serializer';
import { isArray } from 'orbit/lib/objects';
import { assert } from 'orbit/lib/assert';
import { lookupTransformation } from './transformations';

export default Serializer.extend({
	serialize: function(type, record){
		return this.serializeRecord(type, record);
	},

	serializeRecord: function(type, record) {
		assert(record, "Must provide a record");

		var json = {};

		this.serializeKeys(type, record, json);
		this.serializeAttributes(type, record, json);
		this.serializeLinks(type, record, json);

		return json;
	},

	serializeKeys: function(type, record, json) {
		var modelSchema = this.schema.models[type];
		var resourceKey = this.resourceKey(type);
		var value = record[resourceKey];

		if (value) {
			json[resourceKey] = value;
		}
	},

	serializeAttributes: function(type, record, json) {
		var modelSchema = this.schema.models[type];

		Object.keys(modelSchema.attributes).forEach(function(attr) {
			this.serializeAttribute(type, record, attr, json);
		}, this);
	},

	serializeAttribute: function(type, record, attr, json) {
		var attrType = this.schema.models[type].attributes[attr].type;
		var transformation = lookupTransformation(attrType);
		var value = record[attr];
		var serialized = transformation.serialize(value);

		json[this.resourceAttr(type, attr)] = serialized;
	},

	serializeLinks: function(type, record, json) {
		var modelSchema = this.schema.models[type];
		var linkNames = Object.keys(modelSchema.links);

		linkNames.forEach(function(link){
			var value = record.__rel[link];
			json[link] = value;
		});
	},

	deserializeRecords: function(type, records){
		var _this = this;
		return records.map(function(record){
			return _this.deserialize(type, record.id, record);
		});
	},

	deserialize: function(type, id, record){
		record = record || {};
		var data = {};

		this.deserializeKeys(type, id, record, data);
		this.deserializeAttributes(type, record, data);
		this.deserializeLinks(type, record, data);

		return this.schema.normalize(type, data);
	},

	deserializeKeys: function(type, id, record, data){
		data[this.schema.models[type].primaryKey.name] = id;
	},

	deserializeAttributes: function(type, record, data){
		var modelSchema = this.schema.models[type];

		Object.keys(modelSchema.attributes).forEach(function(attr) {
			this.deserializeAttribute(type, record, attr, data);
		}, this);
	},

	deserializeAttribute: function(type, record, attr, data){
		var attrType = this.schema.models[type].attributes[attr].type;
		var transformation = lookupTransformation(attrType);
		var serialized = record[attr];
		var deserialized = transformation.deserialize(serialized);

		data[attr] = deserialized || null; // firebase doesn't like 'undefined' so replace with null
	},

	deserializeLinks: function(type, record, data){
		var _this = this;
		var modelSchema = this.schema.models[type];
		data.__rel = {};

		Object.keys(modelSchema.links).forEach(function(link) {
			var value;
			var linkDef = modelSchema.links[link];

			if(linkDef.type === "hasOne"){
				value = record[link];
			}
			else if(linkDef.type === "hasMany"){
				value = record[link] || {};
			}

			data.__rel[link] = value;
		});
	},

	buildHash: function(keys, value){
		var hash = {};

		keys.forEach(function(key){
			hash[key] = value;
		});

		return hash;
	},

	resourceKey: function(type) {
		return 'id';
	},

	resourceType: function(type) {
		return this.schema.pluralize(type);
	},

	resourceLink: function(type, link) {
		return link;
	},

	resourceAttr: function(type, attr) {
		return attr;
	}
});

function objectValues(object){
	if(!object) return [];
	return Object.keys(object).map(function(key){
		return object[key];
	});
}

export { objectValues };

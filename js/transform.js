// Turns sample JSON into a small schema object. This file does not touch the page.

// Makes a field name look like a type name, for example address becomes Address.
export function toTypeName(name) {
    // Convert a JSON key such as address into Address.
    return name
        .replace(/[^a-zA-Z0-9]/g, " ")
        .split(" ")
        .filter(Boolean)
        .map(function (word) {
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join("");
}

// Makes the first letter of a type name lowercase for a query field.
export function lowerFirst(name) {
    // Convert a type such as User into the query name user.
    return name.charAt(0).toLowerCase() + name.slice(1);
}

// Makes a copy so editing a draft never changes an older published version.
export function copySchema(schema) {
    // JSON copying is enough because the schema contains plain data only.
    return JSON.parse(JSON.stringify(schema));
}

// Returns a scalar type for a simple JavaScript value.
function getScalarType(key, value) {
    // Use the PRD's simple scalar inference rules.
    if (key === "id" || key.toLowerCase().endsWith("id")) {
        return "ID";
    }

    if (typeof value === "boolean") {
        return "Boolean";
    }

    if (typeof value === "number" && Number.isInteger(value)) {
        return "Int";
    }

    if (typeof value === "number") {
        return "Float";
    }

    return "String";
}

// Creates a type if it does not exist yet.
function makeType(schema, typeName) {
    // Reuse an existing type so fields from several samples are merged.
    if (!schema.types[typeName]) {
        schema.types[typeName] = {
            name: typeName,
            fields: {}
        };
    }

    return schema.types[typeName];
}

// Adds fields from one object into a schema type.
function addObjectToSchema(schema, typeName, object, source) {
    // Recursively add one JSON object and its nested objects.
    const type = makeType(schema, typeName);

    // Each JSON key becomes one schema field.
    Object.keys(object).forEach(function (key) {
        const value = object[key];
        let fieldType = "String";
        let note = "";

        // Decide whether the value is null, a list, an object, or a scalar.
        if (value === null || value === undefined) {
            fieldType = "String";
            note = typeName + "." + key + " is null, so check its type before publishing.";
        } else if (Array.isArray(value)) {
            if (value.length === 0) {
                fieldType = "[String]";
                note = typeName + "." + key + " is an empty array, so its item type needs a check.";
            } else if (typeof value[0] === "object" && value[0] !== null) {
                const childType = toTypeName(key.replace(/s$/, ""));
                value.forEach(function (item) {
                    addObjectToSchema(schema, childType, item, source);
                });
                fieldType = "[" + childType + "]";
            } else {
                fieldType = "[" + getScalarType(key, value[0]) + "]";
            }
        } else if (typeof value === "object") {
            const childType = toTypeName(key);
            addObjectToSchema(schema, childType, value, source);
            fieldType = childType;
        } else {
            fieldType = getScalarType(key, value);
        }

        // Keep a previous hidden choice when another sample adds the same field.
        const oldField = type.fields[key];
        type.fields[key] = {
            name: key,
            type: fieldType,
            required: value !== null && value !== undefined,
            hidden: oldField ? oldField.hidden : false,
            source: source,
            note: note || (oldField ? oldField.note : "")
        };

        if (note && !schema.notes.includes(note)) {
            schema.notes.push(note);
        }
    });
}

// Returns a useful query field name from an endpoint path.
function getQueryName(endpoint) {
    // Collection paths use plural names; paths with {id} use one item names.
    const pathName = endpoint.path.split("/")[1] || lowerFirst(endpoint.resource);
    const cleanName = pathName.split("?")[0];

    if (endpoint.path.includes("{id}")) {
        return lowerFirst(endpoint.resource);
    }

    return cleanName || lowerFirst(endpoint.resource) + "s";
}

// Converts all endpoint samples into one schema object.
export function inferSchema(sources, relations) {
    // Build Query fields and object types from every registered endpoint.
    const schema = {
        types: {},
        queryFields: {},
        notes: []
    };

    // Visit each source and then each endpoint sample.
    sources.forEach(function (source) {
        source.endpoints.forEach(function (endpoint) {
            if (!endpoint.sample) {
                return;
            }

            // Treat one object and an array of objects in the same way.
            const sample = Array.isArray(endpoint.sample) ? endpoint.sample : [endpoint.sample];
            sample.forEach(function (item) {
                if (item && typeof item === "object" && !Array.isArray(item)) {
                    addObjectToSchema(
                        schema,
                        endpoint.resource,
                        item,
                        source.name + " " + endpoint.method + " " + endpoint.path
                    );
                }
            });

            const queryName = getQueryName(endpoint);
            const isList = !endpoint.path.includes("{id}") && Array.isArray(endpoint.sample);
            schema.queryFields[queryName] = {
                name: queryName,
                type: isList ? "[" + endpoint.resource + "]" : endpoint.resource,
                args: endpoint.path.includes("{id}") ? "id: ID" : "",
                source: source.name + " " + endpoint.method + " " + endpoint.path,
                endpointId: endpoint.id,
                sourceId: source.id
            };
        });
    });

    // Relations are seeded from the PRD instead of needing a separate editor screen.
    (relations || []).forEach(function (relation) {
        if (!schema.types[relation.fromType] || !schema.types[relation.toType]) {
            return;
        }

        schema.types[relation.fromType].fields[relation.field] = {
            name: relation.field,
            type: relation.toMany ? "[" + relation.toType + "]" : relation.toType,
            required: false,
            hidden: false,
            source: relation.method + " " + relation.path,
            relation: true,
            relationFrom: relation.fromType,
            originalName: relation.field
        };
    });

    return schema;
}

// Adds the exclamation mark used for a required field.
export function fieldTypeText(field) {
    // Add ! after required fields for the SDL preview.
    return field.type + (field.required ? "!" : "");
}

// Creates readable SDL for the schema preview.
export function schemaToSDL(schema) {
    // Turn the plain schema object into readable GraphQL-style text.
    const lines = ["type Query {"];

    // Write the top-level Query fields first.
    Object.keys(schema.queryFields).forEach(function (name) {
        const field = schema.queryFields[name];
        const args = field.args ? "(" + field.args + ")" : "";
        lines.push("  " + name + args + ": " + field.type);
    });

    lines.push("}", "");

    // Write each generated object type after Query.
    Object.keys(schema.types).forEach(function (typeName) {
        lines.push("type " + typeName + " {");

        Object.keys(schema.types[typeName].fields).forEach(function (fieldName) {
            const field = schema.types[typeName].fields[fieldName];
            if (!field.hidden) {
                lines.push("  " + field.name + ": " + fieldTypeText(field));
            }
        });

        lines.push("}", "");
    });

    return lines.join("\n");
}

// Renames one field inside one type.
export function renameField(schema, typeName, oldName, newName) {
    // Move one field to a new key without changing its type information.
    const type = schema.types[typeName];

    if (!type || !type.fields[oldName] || !newName || type.fields[newName]) {
        return false;
    }

    const field = type.fields[oldName];
    field.originalName = field.originalName || oldName;
    if (field.relation) {
        field.relationFrom = field.relationFrom || typeName;
    }
    field.name = newName;
    type.fields[newName] = field;
    delete type.fields[oldName];
    return true;
}

// Renames a type and updates every field that points to it.
export function renameType(schema, oldName, newName) {
    // Rename one type and update every reference to it.
    if (!schema.types[oldName] || !newName || schema.types[newName]) {
        return false;
    }

    const type = schema.types[oldName];
    for (const name of Object.keys(type.fields)) {
        const field = type.fields[name];
        if (field.relation) {
            field.relationFrom = field.relationFrom || oldName;
        }
    }
    type.name = newName;
    schema.types[newName] = type;
    delete schema.types[oldName];

    Object.keys(schema.types).forEach(function (typeName) {
        Object.keys(schema.types[typeName].fields).forEach(function (fieldName) {
            const field = schema.types[typeName].fields[fieldName];
            field.type = renameTypeReference(field.type, oldName, newName);
        });
    });

    Object.keys(schema.queryFields).forEach(function (fieldName) {
        const field = schema.queryFields[fieldName];
        field.type = renameTypeReference(field.type, oldName, newName);
    });

    return true;
}

function renameTypeReference(type, oldName, newName) {
    if (type === oldName) {
        return newName;
    }
    if (type === "[" + oldName + "]") {
        return "[" + newName + "]";
    }
    return type;
}

// Changes whether a field appears in the published SDL.
export function setFieldHidden(schema, typeName, fieldName, hidden) {
    // Keep hidden fields in the draft so the API team can show them again.
    if (!schema.types[typeName] || !schema.types[typeName].fields[fieldName]) {
        return false;
    }

    schema.types[typeName].fields[fieldName].hidden = hidden;
    return true;
}

// Creates a short list of differences between two schema versions.
export function schemaChanges(oldSchema, newSchema) {
    // Make a short human-readable list for the Versions screen.
    const changes = [];
    const oldTypes = oldSchema ? oldSchema.types : {};

    Object.keys(newSchema.types).forEach(function (typeName) {
        if (!oldTypes[typeName]) {
            changes.push("Added type: " + typeName);
        }

        const oldFields = oldTypes[typeName] ? oldTypes[typeName].fields : {};
        Object.keys(newSchema.types[typeName].fields).forEach(function (fieldName) {
            const field = newSchema.types[typeName].fields[fieldName];
            if (!oldFields[fieldName]) {
                changes.push("Added field: " + typeName + "." + fieldName);
            }
            if (field.hidden && oldFields[fieldName] && !oldFields[fieldName].hidden) {
                changes.push("Hidden field: " + typeName + "." + fieldName);
            }
            if (oldFields[fieldName] && !field.hidden && oldFields[fieldName].hidden) {
                changes.push("Shown field: " + typeName + "." + fieldName);
            }
            if (oldFields[fieldName] && fieldTypeText(field) !== fieldTypeText(oldFields[fieldName])) {
                changes.push("Changed field type: " + typeName + "." + fieldName);
            }
        });
        for (const fieldName of Object.keys(oldFields)) {
            if (!newSchema.types[typeName].fields[fieldName]) {
                changes.push("Removed field: " + typeName + "." + fieldName);
            }
        }
    });

    if (oldSchema) {
        Object.keys(oldSchema.types).forEach(function (typeName) {
            if (!newSchema.types[typeName]) {
                changes.push("Removed type: " + typeName);
            }
        });
    }

    if (changes.length === 0) {
        changes.push("No structural changes. Schema reviewed again.");
    }

    return changes;
}

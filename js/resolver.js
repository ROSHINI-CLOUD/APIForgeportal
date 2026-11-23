// Runs the parsed query against mock data or a public GET API.

// Removes list and required symbols so a schema type can be used in JavaScript.
function baseType(type) {
    // Remove GraphQL list and required symbols from a type name.
    return type.replace(/[\[\]!]/g, "");
}

// Replaces the simple {id} placeholder used by the seeded endpoints.
function fillPath(path, id) {
    // Replace the only path variable supported by this MVP.
    return path.replace("{id}", encodeURIComponent(String(id)));
}

// Finds the endpoint that created a schema query field.
function findEndpoint(sources, queryField) {
    // Search the small source list for the endpoint saved on the schema field.
    for (const source of sources) {
        if (queryField.sourceId && source.id !== queryField.sourceId) {
            continue;
        }
        for (const endpoint of source.endpoints) {
            if (endpoint.id === queryField.endpointId) {
                return { source: source, endpoint: endpoint };
            }
        }
    }

    return null;
}

// Finds an endpoint for a seeded relationship.
function findSourceForRelation(sources) {
    // Prefer the seeded JSONPlaceholder source for the demo relation.
    for (const source of sources) {
        if (source.id === "jsonplaceholder") {
            return source;
        }
    }

    return sources[0];
}

// Finds mock rows for a resource.
function getMockRows(sources, resource) {
    // Use the first array sample as the local collection for this resource.
    for (const source of sources) {
        for (const endpoint of source.endpoints) {
            if (endpoint.resource === resource && Array.isArray(endpoint.sample)) {
                return endpoint.sample;
            }
        }
    }

    return [];
}

// Finds one mock object for an endpoint with an id.
function getMockValue(source, endpoint, id) {
    if (!endpoint.path.includes("{id}")) {
        return endpoint.sample;
    }

    const rows = getMockRows([source], endpoint.resource);
    const sample = endpoint.sample;
    if (sample && !Array.isArray(sample) && String(sample.id) === String(id)) {
        return sample;
    }

    return rows.find(function (row) {
        return String(row.id) === String(id);
    }) || null;
}

// Fetches JSON for Live mode. The app will use mock data if this fails.
async function getLiveValue(source, path) {
    // The browser fetch API is enough for public GET endpoints.
    const response = await fetch(source.baseUrl + path);
    if (!response.ok) {
        throw new Error("Live request returned " + response.status + ".");
    }
    return response.json();
}

// Adds a REST call to the visible call list and enforces the ten-call limit.
function checkCallLimit(context) {
    if (context.calls.length >= 10) {
        throw new Error("The query stopped after 10 REST calls.");
    }
}

function addCall(context, source, path, selectedCount, availableCount, mode) {
    context.calls.push({
        method: "GET",
        path: path,
        source: source.name,
        fieldsReturned: selectedCount,
        fieldsAvailable: availableCount,
        mode: mode
    });
}

// Resolves nested fields on one object.
async function resolveObject(object, typeName, selections, schema, sources, relations, context) {
    // Build a new object containing only the fields selected by the query.
    if (!object) {
        return null;
    }

    const type = schema.types[typeName];
    if (!type) {
        throw new Error("Unknown type: " + typeName);
    }

    const result = {};

    // Resolve each requested field in the same order as the query.
    for (const selection of selections) {
        const field = type.fields[selection.name];

        if (!field || field.hidden) {
            throw new Error("Unknown field " + typeName + "." + selection.name + ".");
        }
        const originalName = field.originalName || selection.name;

        // Relations need another REST lookup instead of reading one object key.
        if (field.relation) {
            const relation = relations.find(function (item) {
                return item.fromType === (field.relationFrom || typeName) && item.field === originalName;
            });

            if (!relation) {
                result[selection.name] = [];
                continue;
            }

            const relationSource = findSourceForRelation(sources);
            const relationPath = fillPath(relation.path, object.id);
            let relatedRows;
            const relationMode = relationSource.mode || context.mode;
            let callMode = relationMode;
            checkCallLimit(context);

            // Live mode is attempted first; a failed request safely uses Mock data.
            try {
                if (relationMode === "live") {
                    relatedRows = await getLiveValue(relationSource, relationPath);
                } else {
                    relatedRows = getMockRows([relationSource], relation.toType).filter(function (row) {
                        return String(row.userId) === String(object.id);
                    });
                }
            } catch (error) {
                relatedRows = getMockRows([relationSource], relation.toType).filter(function (row) {
                    return String(row.userId) === String(object.id);
                });
                callMode = "Mock fallback";
                context.usedFallback = true;
            }

            if (!Array.isArray(relatedRows)) {
                relatedRows = [relatedRows];
            }

            addCall(
                context,
                relationSource,
                relationPath,
                selection.fields.length,
                relatedRows[0] ? Object.keys(relatedRows[0]).length : 0,
                callMode
            );

            // Trim every related row to the nested fields requested by the user.
            const relatedValues = [];
            for (const row of relatedRows) {
                relatedValues.push(await resolveObject(
                    row,
                    baseType(field.type),
                    selection.fields,
                    schema,
                    sources,
                    relations,
                    context
                ));
            }
            result[selection.name] = relatedValues;
            continue;
        }

        // Normal fields are read directly from the REST object.
        const value = object[originalName];
        if (value === undefined) {
            throw new Error("The field " + typeName + "." + selection.name + " is not in the response.");
        }

        // Recursively resolve nested objects; otherwise copy the scalar value.
        if (selection.fields.length > 0 && value !== null) {
            const childType = baseType(field.type);
            if (Array.isArray(value)) {
                result[selection.name] = [];
                for (const child of value) {
                    result[selection.name].push(await resolveObject(
                        child,
                        childType,
                        selection.fields,
                        schema,
                        sources,
                        relations,
                        context
                    ));
                }
            } else {
                result[selection.name] = await resolveObject(
                    value,
                    childType,
                    selection.fields,
                    schema,
                    sources,
                    relations,
                    context
                );
            }
        } else {
            result[selection.name] = value;
        }
    }

    return result;
}

// Runs every top-level field in a parsed query.
export async function runQuery(parsedQuery, schema, sources, relations, mode) {
    // Resolve each top-level query field and collect its visible call plan.
    const response = {};
    const context = {
        calls: [],
        mode: mode,
        usedFallback: false
    };

    // The parser has already checked the shape, so this loop focuses on data.
    for (const selection of parsedQuery.fields) {
        const queryField = schema.queryFields[selection.name];
        if (!queryField) {
            throw new Error("Unknown query field: " + selection.name + ".");
        }

        const endpointInfo = findEndpoint(sources, queryField);
        if (!endpointInfo) {
            throw new Error("No REST endpoint is connected to " + selection.name + ".");
        }

        const source = endpointInfo.source;
        const endpoint = endpointInfo.endpoint;
        const id = selection.args.id;
        if (endpoint.path.includes("{id}") && (typeof id !== "string" && typeof id !== "number")) {
            throw new Error("Provide an id for " + selection.name + ".");
        }
        const path = fillPath(endpoint.path, id);
        let data;
        const sourceMode = source.mode || mode;
        let callMode = sourceMode;
        checkCallLimit(context);

        // Try Live mode only when the user selected it.
        try {
            if (sourceMode === "live") {
                data = await getLiveValue(source, path);
            } else {
                data = getMockValue(source, endpoint, id);
            }
        } catch (error) {
            data = getMockValue(source, endpoint, id);
            callMode = "Mock fallback";
            context.usedFallback = true;
        }

        if (data === null || data === undefined) {
            throw new Error("No record was found for " + selection.name + ".");
        }

        // Count requested and available fields for the Calls panel.
        const firstRow = Array.isArray(data) ? data[0] : data;
        addCall(
            context,
            source,
            path,
            selection.fields.length,
            firstRow ? Object.keys(firstRow).length : 0,
            callMode
        );

        // Convert the result into the same shape as the query selection.
        const typeName = baseType(queryField.type);
        if (Array.isArray(data)) {
            response[selection.name] = [];
            for (const row of data) {
                response[selection.name].push(await resolveObject(
                    row,
                    typeName,
                    selection.fields,
                    schema,
                    sources,
                    relations,
                    context
                ));
            }
        } else {
            response[selection.name] = await resolveObject(
                data,
                typeName,
                selection.fields,
                schema,
                sources,
                relations,
                context
            );
        }
    }

    return {
        data: response,
        calls: context.calls,
        usedFallback: context.usedFallback
    };
}

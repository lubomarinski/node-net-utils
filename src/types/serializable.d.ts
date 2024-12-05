export type SerializableValue =  string | number | boolean | null | undefined | SerializableObject | SerializableArray;

interface SerializableObject {
[property: string]: SerializableValue;
}

interface SerializableArray extends Array<SerializableValue> {}
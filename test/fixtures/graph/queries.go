package graph

const findNode = "MATCH (n:Node {id: $id}) RETURN n.id"

// MATCH in a comment should not fire

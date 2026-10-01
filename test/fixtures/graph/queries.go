package graph

const findNode = "MATCH (n:Node {id: $id}) RETURN n"

// MATCH in a comment should not fire

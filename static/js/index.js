var c = new Circuit();

var s1 = new Source("s1");
var s2 = new Source("s2", true);

var _or = new Block(OR, "or");
var _and = new Block(AND, "and");

s1 = c.add(s1);
s2 = c.add(s2);
_and = c.add(_and);
_or = c.add(_or);

c.connect(s1, 0, _and, 0);
c.connect(s2, 0, _and, 1);
c.connect(s1, 0, _or, 0);
c.connect(s2, 0, _or, 1);

c.step();

console.log(s1.values);
console.log(s2.values);
console.log(_or.values);
console.log(_and.values);
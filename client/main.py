from __future__ import annotations
from dataclasses import dataclass
from typing import Callable
from enum import Enum


Bits = tuple[bool, ...]


@dataclass(frozen=True, slots=True)
class GateType:
    name: str
    n_in: int
    n_out: int
    func: Callable[..., Bits]

def clock(f: int):
    count = f

    def _clock():
        nonlocal count
        # print("i")
        # print(count)
        if count == f:
            count = 0
            return True
        count += 1

        return False

    return _clock


def _clock(f):
    v = clock(f)
    return lambda : (v(), )


NOT = GateType("not", 1, 1, lambda a:    (not a, ))
AND = GateType("and", 2, 1, lambda a, b: (a and b, ))
OR  = GateType("or",  2, 1, lambda a, b: (a or b, ))
XOR = GateType("xor", 2, 1, lambda a, b: (a ^ b, ))

class MAIN_GATES(Enum):
    NOT = NOT
    AND = AND
    OR  = OR
    XOR = XOR

CLOCK_1HZ = GateType("clock 1Hz", 0, 1, _clock(2))

MAIN_GATES.AND


class Wire:
    """Represents the wire between the blocks"""
    __slots__ = ("value", "source", "destinations")

    def __init__(self) -> None:
        self.value = False
        self.source: tuple[Block, int] | None = None
        self.destinations: list[tuple[Block, int]] = []


class Block:
    def __init__(self, kind: GateType, name: str | None = None) -> None:
        self.kind = kind
        self.name = name or kind.name
        self.inputs: list[Wire | None] = [None] * kind.n_in
        self.outputs = [Wire() for _ in range(kind.n_out)]
        for i, net in enumerate(self.outputs):
            net.source = (self, i)

    def evaluate(self) -> bool:
        """Recompute outputs; return True if any output changed."""
        vals = (input.value if input else False for input in self.inputs)
        new = self.kind.func(*vals)
        changed = False
        for net, v in zip(self.outputs, new):
            if net.value != v:
                net.value, changed = v, True
        return changed


class Source(Block):
    """External input (switch)."""

    def __init__(self, name: str, value: bool = False) -> None:
        super().__init__(GateType("SRC", 0, 1, lambda: (False,)), name)
        self.outputs[0].value = value

    def set(self, v: bool) -> None:
        self.outputs[0].value = v

    def evaluate(self) -> bool:
        return False


class Clock(Block):
    def __init__(self, f: int, name: str = None, value: bool = False):
        super().__init__(GateType(f"clock {f}Hz", 0, 1, _clock(f)))
        self.name = name or self.kind.name



def toposort(blocks: list[Block]):
    indeg = {b: sum(n is not None and n.source[0] is not b for n in b.inputs)
                for b in blocks
            }
    ready = [b for b, d in indeg.items() if d == 0]
    order = []
    while ready:
        b = ready.pop()
        order.append(b)
        for net in b.outputs:
            for sink, _ in net.destinations:
                indeg[sink] -= 1
                if indeg[sink] == 0:
                    ready.append(sink)
    return order if len(order) == len(blocks) else None


# class BlockGroup(Block):
#     def __init__(self, blocks: list[Block]) -> None:
#         self.blocks = blocks
#         self._order = toposort(blocks)
#         # super().__init__(kind, name)



class Circuit:
    def __init__(self) -> None:
        self.blocks: list[Block] = []
        self._order: list[Block] | None = None

    def add(self, block: Block) -> Block:
        self.blocks.append(block)
        self._order = None
        return block

    def connect(self, src: Block, src_port: int, dst: Block, dst_port: int):
        if dst.inputs[dst_port] is not None:
            raise ValueError(f"{dst.name} input {dst_port} already driven")
        net = src.outputs[src_port]
        dst.inputs[dst_port] = net
        net.destinations.append((dst, dst_port))
        self._order = None

    def disconnect(self, wire: Wire, i: int):
        if wire.source is None:
            return

        dst, port = wire.destinations[i]
        wire.destinations.remove((dst, port))
        dst.inputs[port] = None

        self._order = None

    def _toposort(self) -> list[Block] | None:
        return toposort(self.blocks)

    def step(self, max_iter: int = 100):
        if self._order is None:
            self._order = self._toposort() or []
        if self._order:                       # combinational: single pass
            for b in self._order:
                b.evaluate()
        else:                                 # feedback: iterate to a fixed point
            for _ in range(max_iter):
                if not any([b.evaluate() for b in self.blocks]):
                    return
            raise RuntimeError("Circuit did not stabilise (oscillation?)")



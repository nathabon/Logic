from __future__ import annotations
from dataclasses import dataclass
from typing import Callable
from enum import Enum
from collections import deque


Bits = tuple[bool, ...]


@dataclass(frozen=True, slots=True)
class GateType:
    name: str
    n_in: int
    n_out: int
    func: Callable[..., Bits]
    delay: int = 1

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
        self._pipe: deque[Bits] = deque([(False,) * kind.n_out] * (kind.delay - 1))

    @property
    def n_in(self):
        return self.kind.n_in

    @property
    def n_out(self):
        return self.kind.n_out

    @property
    def values(self):
        return [o.value for o in self.outputs]

    def compute(self) -> Bits:
        vals = [n.value if n else False for n in self.inputs]
        self._pipe.append(self.kind.func(*vals))
        return self._pipe.popleft()

    


class Source(Block):
    """External input (switch)."""

    def __init__(self, name: str, value: bool = False) -> None:
        super().__init__(GateType("SRC", 0, 1, lambda: (False,)), name)
        self.outputs[0].value = value

    def set(self, v: bool) -> None:
        self.outputs[0].value = v

    def compute(self) -> Bits: 
        return (self.outputs[0].value,)


class Clock(Block):
    def __init__(self, f: int, name: str = None, value: bool = False):
        super().__init__(GateType(f"clock {f}Hz", 0, 1, _clock(f)))
        self.name = name or self.kind.name



class Circuit:
    def __init__(self) -> None:
        self.blocks: list[Block] = []
        self.tick = 0

    def add(self, block: Block) -> Block:
        self.blocks.append(block)
        return block

    def connect(self, src: Block, src_port: int, dst: Block, dst_port: int):
        if dst.inputs[dst_port] is not None:
            raise ValueError(f"{dst.name} input {dst_port} already driven")
        net = src.outputs[src_port]
        dst.inputs[dst_port] = net
        net.destinations.append((dst, dst_port))

    def disconnect(self, wire: Wire, i: int):
        if wire.source is None:
            return

        dst, port = wire.destinations[i]
        wire.destinations.remove((dst, port))
        dst.inputs[port] = None


    def step(self) -> None:
        results = [(b, b.compute()) for b in self.blocks]
        for b, bits in results:
            for net, v in zip(b.outputs, bits):
                net.value = v
        self.tick += 1



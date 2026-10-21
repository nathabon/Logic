import pygame as pg
from dataclasses import dataclass
from client.main import *


BLACK, WHITE = (0, 0, 0), (255, 255, 255)
GRAY = (100, 100, 100)
RED, GREEN = (200, 50, 50), (50, 200, 50)
SIZE = (40, 40)
PIN_RADIUS = 5


def pin_offsets(count: int, x: int) -> list[tuple[int, int]]:
    delta = SIZE[1] / (count + 1)
    return [(x, int((i + 1) * delta)) for i in range(count)]

def point_on_line(p, a, b, tolerance=2.0):
    P = pg.Vector2(p)
    A = pg.Vector2(a)
    B = pg.Vector2(b)
    
    AB = B - A
    AP = P - A
    
    if AB.length_squared() == 0:
        return AP.length() <= tolerance

    t = AP.dot(AB) / AB.length_squared()
    t = max(0.0, min(1.0, t))
    
    closest_point = A + t * AB
    
    distance = P.distance_to(closest_point)
    return distance <= tolerance

# MARK: BlockGUI

class BlockGUI(pg.sprite.Sprite):
    def __init__(self, block: Block, font: pg.font.Font, pos=(0, 0)):
        super().__init__()
        self.block = block
        self.rect = pg.Rect(pos, SIZE)
        self.grab_offset = None

        # body
        self.surface = pg.Surface(SIZE)
        self.surface.fill(WHITE)
        label = font.render(block.name, True, BLACK)
        self.surface.blit(label, label.get_rect(center=self.surface.get_rect().center))
        pg.draw.rect(self.surface, BLACK, self.surface.get_rect(), 1)

        # pins
        self.in_offsets = pin_offsets(len(block.inputs), -5)
        self.out_offsets = pin_offsets(len(block.outputs), SIZE[0] + 5)

        self.in_recs = []
        self.out_recs = []
        self.wire_recs = []

    @property
    def pos(self):
        return self.rect.topleft

    def pin_pos(self, offset: tuple[int, int]) -> tuple[int, int]:
        """Screen position of a pin (useful later for wires and click detection)."""
        return (self.rect.x + offset[0], self.rect.y + offset[1])

    def pins_collidepoint(self, x_y: pg.typing.Point):
        for i, p in enumerate(self.in_recs):
            if p.collidepoint(x_y):
                return (False, i, self.block.inputs[i])

        for i, p in enumerate(self.out_recs):
            if p.collidepoint(x_y):
                return (True, i, self.block.outputs[i])

        return None

    def wire_collidepoint(self, x_y: pg.typing.Point):
        for rec in self.wire_recs:
            if rec[0].collidepoint(x_y) and point_on_line(x_y, rec[-1][0], rec[-1][1]):
                return rec[1:-1]

        return None

    def handle_event(self, event: pg.event.Event, gui: MainGUI):
        if event.type == pg.MOUSEBUTTONDOWN and event.button == 1:
            if self.rect.collidepoint(event.pos):
                pg.draw.rect(self.surface, BLACK, self.surface.get_rect(), 3)
                self.grab_offset = (self.rect.x - event.pos[0], self.rect.y - event.pos[1])
                return True

            pg.draw.rect(self.surface, BLACK, self.surface.get_rect(), 1)

            pin_collide = self.pins_collidepoint(event.pos)
            if pin_collide is not None:
                inp, i, wire = pin_collide
                if inp:
                    gui.out_selected = (self, i)
                else:
                    gui.in_selected = (self, i)

                if gui.in_selected is not None and gui.out_selected is not None:
                    gui.circuit.connect(gui.out_selected[0].block, gui.out_selected[1], gui.in_selected[0].block, gui.in_selected[1])
                    gui.in_selected = None
                    gui.out_selected = None

                return True

            wire_collide = self.wire_collidepoint(event.pos)
            if wire_collide is not None:
                wire, i = wire_collide
                gui.circuit.disconnect(wire, i)
                return True

            
        elif event.type == pg.MOUSEBUTTONUP and event.button == 1:
            if self.grab_offset is not None:
                self.grab_offset = None
                return True
            
        elif event.type == pg.MOUSEMOTION and self.grab_offset is not None:
            self.rect.topleft = (event.pos[0] + self.grab_offset[0], event.pos[1] + self.grab_offset[1])
            return True
        
        return False

    def draw(self, target: pg.Surface, gui: MainGUI):
        target.blit(self.surface, self.rect)

        self.in_recs.clear()
        for wire, off in zip(self.block.inputs, self.in_offsets):
            color = GREEN if wire is not None and wire.value else RED
            self.in_recs.append(pg.draw.circle(target, color, self.pin_pos(off), PIN_RADIUS))
            
        self.out_recs.clear()
        self.wire_recs.clear()
        for wire, off in zip(self.block.outputs, self.out_offsets):
            color = GREEN if wire.value else RED
            self.out_recs.append(pg.draw.circle(target, color, self.pin_pos(off), PIN_RADIUS))
            for i, (dest, port) in enumerate(wire.destinations):
                dest = gui.get_block(dest)
                a = self.pin_pos(off)
                b = dest.pin_pos(dest.in_offsets[port])
                rec = pg.draw.line(target, color, a, b)
                self.wire_recs.append((rec, wire, i, (a, b)))


# MARK: MainGUI
class MainGUI:
    def __init__(self, circuit: Circuit):
        self.blocks = []
        self.f = 1
        self.circuit = circuit

        self.selected: BlockGUI | None = None
        self.in_selected: tuple[BlockGUI, int] | None = None
        self.out_selected: tuple[BlockGUI, int] | None = None

        self.__init_pygame()

    def __init_pygame(self):
        pg.init()
        self.screen = pg.display.set_mode((400, 300))
        pg.display.set_caption("Logic GUI")
        self.font = pg.font.SysFont(None, 22)

    def add_block(self, block: Block):
        self.blocks.append(BlockGUI(block, font=self.font, pos=(100, 50)))

    def get_block(self, block: Block):
        return list(filter(lambda e: e.block == block, self.blocks))[0]

    def run(self):
        clock = pg.time.Clock()


        running = True
        count = 0
        while running:
            for event in pg.event.get():
                if event.type == pg.QUIT:
                    running = False
                else:
                    for view in reversed(self.blocks):
                        if view.handle_event(event, self):
                            break

            if count % (60 / self.f) == 0:
                self.circuit.step()

            self.screen.fill(GRAY)
            for view in self.blocks:
                view.draw(self.screen, self)
            pg.display.flip()
            clock.tick(60)

            count += 1

        pg.quit()


if __name__ == "__main__":
    c = Circuit()
    gui = MainGUI(c)
    s1 = c.add(Source("a"))
    s2 = c.add(Clock(1))
    _and = c.add(Block(AND))
    _or = c.add(Block(OR))
    _or2 = c.add(Block(OR))
    c.connect(s1, 0, _and, 0)
    c.connect(s2, 0, _and, 1)
    c.connect(s1, 0, _or, 0)
    c.connect(s2, 0, _or, 1)
    gui.add_block(s1)
    gui.add_block(s2)
    gui.add_block(_and)
    gui.add_block(_or)
    gui.add_block(_or2)

    gui.run()
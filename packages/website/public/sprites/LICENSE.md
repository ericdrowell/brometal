# Sprite licenses

Every file in this directory comes from the
[Ninja Adventure Asset Pack](https://pixel-boy.itch.io/ninja-adventure-asset-pack)
by [Pixel-boy](https://pixel-boy.itch.io/) and
[AAA](https://www.instagram.com/challenger.aaa/), released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain).

The pack ships the full CC0 1.0 legal text along with this statement from its
README:

> They are released under the Creative Commons Zero (CC0) license.
>
> You can use any and all of the assets found in this package in your own games,
> even commercial ones. Attribution is not required but appreciated.

Attribution is not required. It is here because the authors asked nicely, and
because a file that cannot say where it came from is a file nobody can safely
reuse.

Copied unmodified from the pack. The Legend of Bro demo composites the ones it
needs into a single atlas in the browser, so no edited derivative is stored here
— what is committed is what the authors published.

| File | Path in the pack |
|------|------------------|
| TilesetFloor.png | `Backgrounds/Tilesets/TilesetFloor.png` |
| TilesetNature.png | `Backgrounds/Tilesets/TilesetNature.png` |
| hero.png | `Actor/Character/ManGreen/SeparateAnim/Walk.png` |
| slime.png | `Actor/Monster/Slime/Slime.png` |
| bat.png | `Actor/Monster/BlueBat/SpriteSheet.png` |

## Sheet layout

All art is on a 16×16 pixel grid.

The three actor sheets are 4×4 cells with the same layout: **columns are the
facing** — down, up, left, right — and **rows are the four animation frames**.
The hero uses the pack's dedicated walk sheet rather than its combined
spritesheet, so every cell is a walk frame and no row needs identifying by eye.

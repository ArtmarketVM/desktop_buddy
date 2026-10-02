# Desktop Buddy character prompts

Use these prompts in ChatGPT image generation. Start with one character in Blue, approve its appearance, then attach that approved image when requesting other colors or poses. These prompts are for this independent Windows app, not ChatGPT Pets.

## Shared art direction

Append this block to each character prompt:

> Create a premium companion illustration for a minimalist Windows productivity app. A warm, approachable character with a clear silhouette, rounded proportions, a large expressive face, tiny paws or wings, and restrained detail. Modern editorial character design with subtle 2.5D volume, matte surfaces, soft internal shading and crisp edges. Cute without looking like a toy advertisement. Full body, front three-quarter view, centered on a 1024 × 1024 canvas with 15% transparent padding. True transparent background. No text, letters, logo, watermark, scenery, floor, props, cast shadow, glow or background gradient. Keep the silhouette readable at 80 pixels. Eye whites and small highlights are off-white; eyes and facial marks are deep charcoal. Use only the specified body color plus lighter and darker shades of that color. Avoid green accents. The character must look equally clear over white and near-black interfaces. Keep the same lighting, proportions and visual language across the entire character family. One character only, neutral relaxed pose, complete ears, tail, paws and body visible.

## Four starting prompts

**Dog**

> Design Buddy Dog, a small friendly dog with soft floppy ears, a rounded muzzle, a small charcoal nose, short legs and a curved expressive tail. Its personality is patient, optimistic and quietly supportive. Avoid breed-specific realism, collars and accessories. Body palette: Blue #4B8EF5. [Append the shared art direction.]

**Cat**

> Design Buddy Cat, a compact friendly cat with gently pointed ears, a rounded head, subtle whisker marks, short paws and a thick curled tail. Its personality is observant, thoughtful and quietly playful. Avoid photorealistic fur, clothing and accessories. Body palette: Blue #4B8EF5. [Append the shared art direction.]

**Seal**

> Design Buddy Seal, a little rounded seal with a soft pear-shaped body, a small muzzle, subtle whisker marks, tiny front flippers and a readable tail. Its personality is calm, reassuring and a little curious. Avoid realistic wet skin, clothing and accessories. Body palette: Blue #4B8EF5. [Append the shared art direction.]

**Bird**

> Design Buddy Bird, a plump little bird with a rounded body, a tiny simple charcoal beak, short wings, a small feather tuft and tiny charcoal feet. Its personality is curious, cheerful and attentive. Avoid complex feathers, clothing and accessories. Body palette: Blue #4B8EF5. [Append the shared art direction.]

## Three fixed colors

For each approved character, attach its image and use:

> Edit the attached approved Buddy character. Preserve its identity, proportions, face, silhouette, pose, lighting, framing and transparent background exactly. Change only the main body palette to [Red #EF6B6B / Yellow #F2C94C / Blue #4B8EF5], using lighter and darker shades of that same color for volume. Keep eyes, facial marks and highlights unchanged. Do not introduce other hues. Deliver a single transparent 1024 × 1024 PNG.

Generate each color as a separate file. Do not ask for an automatically cut sprite grid as the first deliverable.

## Pose prompts and animation behavior

Attach the approved character for every pose. Prefix each request with:

> Use the attached character as the exact model reference. Preserve its shape, colors, proportions, visual style, camera angle, scale and canvas alignment. Change only the pose and expression described below. Full character, transparent 1024 × 1024 PNG, identical padding and baseline. No words, symbols, props or extra objects.

| State       | Pose to append                                                                          | Planned motion in code                                      |
| ----------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Idle        | Relaxed eyes, gentle smile, comfortable resting pose.                                   | Slow breathing; an occasional blink.                        |
| Working     | Alert but calm eyes, slight forward lean, steady attentive posture.                     | Small breathing loop; subtle ear or tail movement.          |
| Thinking    | Curious eyes looking slightly upward, head tilted a few degrees, reflective expression. | A slow head tilt, then stillness.                           |
| Away        | Eyes closed, curled or comfortably resting posture; peaceful rather than sad.           | Very slow breathing; no attention-grabbing motion.          |
| Paused      | Relaxed seated pose, eyes half-open, neutral friendly expression.                       | One transition to resting, then nearly still.               |
| Helpful     | Bright attentive expression and one small raised paw, flipper or wing.                  | A single gentle gesture when a suggestion arrives.          |
| Celebrating | Joyful eyes, broad warm smile, lifted paws or wings, slight upward stretch.             | A brief bounce after explicit goal completion, then settle. |
| Greeting    | Friendly smile, one raised paw, flipper or wing in a little greeting.                   | One short wave when shown on the desktop.                   |
| Returning   | Waking, stretching slightly, eyes opening with a gentle smile.                          | A brief stretch when the user returns, then Working.        |

For an animation made from separate frames:

> Create the next frame of the [state] motion using the attached approved frame. Move only [the eyelids / the tail / the raised paw] by a small amount. Keep every other pixel region, the character scale, baseline, lighting and transparent canvas consistent. No camera movement or new details.

## Asset handoff

- Keep approved masters outside Git until assets are selected; add only approved optimized app assets.
- Suggested names: `dog-blue-idle.png`, `dog-blue-working.png`, `dog-red-idle.png`.
- Preferred runtime layer exports: body, eyes, ears, tail, gesture limb. Every layer uses the same canvas and transparent background. If the image tool cannot isolate a layer reliably, animate the complete approved PNG with small transforms instead.
- Start with Idle, Working, Away, Thinking and Celebrating for one character. Expand to the other characters after testing small-size readability and both themes.
- Keep breathing below roughly 2% scale and tilts below 3°. Celebrations should finish in under two seconds. Respect Reduce Motion: use static poses and immediate state changes.
- Do not infer productivity from an animation. Working reflects observed activity; Thinking means a requested AI operation is running; Celebrating follows explicit goal completion.

The current app still uses its existing animated SVG characters. These prompts define replacement artwork for a later asset import.

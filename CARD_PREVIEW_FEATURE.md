# Card Preview Feature - Long Press Implementation

## Overview
Added a long-press feature that allows players to view the actual card graphics from the spritesheet by long-pressing (mobile) or right-clicking (desktop) any face-up card.

## What Was Implemented

### 1. **Spritesheet Integration**
- Moved `tussie_mussie.png` to `/public/images/`
- Created mapping for all 18 cards to their positions in the spritesheet
- Cards mapped: camellia, red-rose, red-tulip, amaryllis, pink-rose, pink-larkspur, peony, phlox, forget-me-not, hyacinth, violet, snapdragon, honeysuckle, carnation, marigold, gardenia, daisy, orchid

### 2. **Modal Preview System**
- Added a full-screen modal overlay that appears on long-press
- Modal displays the actual card graphic from the spritesheet
- Shows card name for reference
- Includes a close button and background-click to dismiss

### 3. **User Interaction**
**Mobile:**
- Long-press (500ms) on any face-up card to preview
- Touch and hold triggers the preview
- Moving finger cancels the long-press

**Desktop:**
- Right-click on any card to instantly preview
- Long left-click (500ms) also works
- Hover away cancels the long-press

### 4. **Visual Hints**
- Added a subtle eye emoji (👁️) to the bottom-right of previewable cards
- Cursor changes to pointer on hover
- Card scales slightly when pressed

### 5. **Responsive Design**
- Modal is fully responsive
- Works on all screen sizes
- Image scales to fit screen (max 90vh)
- Touch-optimized for mobile devices

## Files Modified

1. **`/views/game.ejs`**
   - Added CSS for modal and card preview
   - Added HTML for preview modal
   - Added JavaScript for long-press detection
   - Updated `createCardElement()` to attach long-press handlers
   - Added card sprite mapping

2. **`/public/images/tussie_mussie.png`**
   - Copied spritesheet to public directory

## How It Works

1. When a face-up card is created, `setupCardLongPress()` is called
2. Event listeners are attached for touch and mouse events
3. On long-press (500ms) or right-click, `showCardPreview()` is triggered
4. Modal displays with the card graphic and name
5. User can close by:
   - Clicking the close button
   - Clicking the dark background
   - (Future: ESC key)

## Future Enhancements

### Spritesheet Optimization
Currently showing the full spritesheet. Could be improved by:
1. Using CSS `background-position` to crop to specific card
2. Pre-extracting individual card images
3. Using a canvas to extract the specific card region

### Additional Features
- Add ESC key to close modal
- Add swipe gestures to view next/previous cards
- Add zoom capability for card details
- Add card statistics or play history

## Testing Checklist

- [ ] Mobile: Long-press works on all cards
- [ ] Mobile: Touch-move cancels long-press
- [ ] Desktop: Right-click works
- [ ] Desktop: Long left-click works
- [ ] Modal displays correctly on all screen sizes
- [ ] Close button works
- [ ] Background click dismisses modal
- [ ] Eye icon appears on previewable cards
- [ ] No long-press on face-down cards
- [ ] Spritesheet loads correctly

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- iOS Safari (touch events)
- Android Chrome (touch events)
- Context menu is prevented on right-click

## Performance Notes

- Spritesheet is 49MB - consider optimizing/compressing for production
- Event listeners are efficiently managed (no memory leaks)
- Modal uses CSS animations for smooth transitions

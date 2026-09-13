import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";

export function useOverlayResizer() {
  const [anchorState, setAnchorState] = useState<string>("top");
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);
  const hoverTimer = useRef<any>(null);

  // Set initial window size and position on mount (starting in resting state)
  useEffect(() => {
    const initSize = async () => {
      const monitor = await currentMonitor();
      if (monitor) {
        const scale = monitor.scaleFactor;
        const screenW = monitor.size.width / scale;
        const winW = 140;
        const winH = 64;
        const newX = (screenW - winW) / 2;
        const newY = 0;
        await invoke("resize_overlay_window", { w: winW, h: winH, x: newX, y: newY });
      }
    };
    initSize();
  }, []);

  // Snapping logic on move
  useEffect(() => {
    let debounceTimeout: any = null;
    const appWindow = getCurrentWindow();

    const registerMoveListener = async () => {
      const unlisten = await appWindow.onMoved((event) => {
        const { x, y } = event.payload; // Physical positions
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(async () => {
          const monitor = await currentMonitor();
          if (monitor) {
            const scale = monitor.scaleFactor;
            // Physical coordinates to logical coordinates
            const logicalX = x / scale;
            const logicalY = y / scale;
            const screenW = monitor.size.width / scale;
            const screenH = monitor.size.height / scale;

            const winW = hoveredRef.current ? 410 : 140;
            const winH = 64;

            const distTop = logicalY;
            const distBottom = screenH - (logicalY + winH);
            const distLeft = logicalX;
            const distRight = screenW - (logicalX + winW);

            const minDist = Math.min(distTop, distBottom, distLeft, distRight);

            let snapX = logicalX;
            let snapY = logicalY;
            let anchor = "floating";

            // Snap threshold is 100 logical pixels
            if (minDist < 100) {
              if (minDist === distTop) {
                snapX = (screenW - winW) / 2;
                snapY = 0;
                anchor = "top";
              } else if (minDist === distBottom) {
                snapX = (screenW - winW) / 2;
                snapY = screenH - winH;
                anchor = "bottom";
              } else if (minDist === distLeft) {
                snapX = 0;
                snapY = (screenH - winH) / 2;
                anchor = "left";
              } else {
                snapX = screenW - winW;
                snapY = (screenH - winH) / 2;
                anchor = "right";
              }
              // Perform the snap!
              await invoke("resize_overlay_window", { w: winW, h: winH, x: snapX, y: snapY });
            }
            setAnchorState(anchor);
          }
        }, 120);
      });
      return unlisten;
    };

    const promise = registerMoveListener();
    return () => {
      clearTimeout(debounceTimeout);
      promise.then((unlisten) => unlisten());
    };
  }, []);

  const handleMouseEnter = async () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    hoveredRef.current = true;
    setHovered(true);

    const monitor = await currentMonitor();
    if (monitor) {
      const scale = monitor.scaleFactor;
      const screenW = monitor.size.width / scale;
      const screenH = monitor.size.height / scale;

      const winW = 410;
      const winH = 64;

      let newX = 0;
      let newY = 0;

      if (anchorState === "top") {
        newX = (screenW - winW) / 2;
        newY = 0;
      } else if (anchorState === "bottom") {
        newX = (screenW - winW) / 2;
        newY = screenH - winH;
      } else if (anchorState === "left") {
        newX = 0;
        newY = (screenH - winH) / 2;
      } else {
        newX = screenW - winW;
        newY = (screenH - winH) / 2;
      }

      await invoke("resize_overlay_window", { w: winW, h: winH, x: newX, y: newY });
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
    }
    hoveredRef.current = false;
    setHovered(false);

    // Wait for the CSS transition to finish before shrinking the Tauri window
    hoverTimer.current = setTimeout(async () => {
      const monitor = await currentMonitor();
      if (monitor) {
        const scale = monitor.scaleFactor;
        const screenW = monitor.size.width / scale;
        const screenH = monitor.size.height / scale;

        const winW = 140;
        const winH = 64;

        let newX = 0;
        let newY = 0;

        if (anchorState === "top") {
          newX = (screenW - winW) / 2;
          newY = 0;
        } else if (anchorState === "bottom") {
          newX = (screenW - winW) / 2;
          newY = screenH - winH;
        } else if (anchorState === "left") {
          newX = 0;
          newY = (screenH - winH) / 2;
        } else {
          newX = screenW - winW;
          newY = (screenH - winH) / 2;
        }

        await invoke("resize_overlay_window", { w: winW, h: winH, x: newX, y: newY });
      }
    }, 360);
  };

  return { anchorState, hovered, handleMouseEnter, handleMouseLeave };
}

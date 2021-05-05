import glob from "glob";
import { promisify } from "util";
import { pathExists } from "fs-extra";
import Path from "path";
import l10n from "../helpers/l10n";

const globAsync = promisify(glob);

export default async (
  buildRoot,
  { CART_TYPE, customColorsEnabled, musicDriver, profile, platform }
) => {
  const cmds = platform === "win32" ? [""] : ["#!/bin/bash", "set -e"];
  const objFiles = [];

  const CC =
    platform === "win32"
      ? `..\\_gbstools\\gbdk\\bin\\lcc`
      : `../_gbstools/gbdk/bin/lcc`;
  const PACK =
    platform === "win32"
      ? `..\\_gbstools\\gbspack\\gbspack`
      : `../_gbstools/gbspack/gbspack`;
  let CFLAGS = `-Iinclude -Wa-Iinclude -Wa-I../_gbstools/gbdk/lib/small/asxxxx -Wl-a -DSGB -c`;
  let LFLAGS = ` -Wl-yt${CART_TYPE} -Wl-ya4 -Wl-j -Wl-m -Wl-w -Wl-klib -Wl-g_shadow_OAM2=0xDF00 -Wl-g.STACK=0xDF00 -Wi-e -Wm-ys`;

  if (customColorsEnabled) {
    CFLAGS += " -DCGB";
    LFLAGS += " -Wm-yC";
  }

  if (musicDriver === "huge") {
    CFLAGS += " -DHUGE_TRACKER";
    LFLAGS += " -Wl-lhUGEDriver.lib";
  } else {
    CFLAGS += " -DGBT_PLAYER";
    LFLAGS += " -Wl-lgbt_player.lib";
  }

  if (profile) {
    CFLAGS += " -Wf--profile";
  }

  const srcRoot = `${buildRoot}/src/**/*.@(c|s)`;
  const buildFiles = await globAsync(srcRoot);

  const addCommand = (label, cmd) => {
    if (platform === "win32") {
      cmds.push(`@echo ${label}`);
      cmds.push(`@${cmd}`);
    } else {
      cmds.push(`echo "${label}"`);
      cmds.push(cmd);
    }
  };

  const getValue = (label, variable, cmd) => {
    if (platform === "win32") {
      cmds.push(`@echo ${label}`);
      cmds.push(`@${cmd}>${variable}`);
      cmds.push(`@SET /P ${variable}=<${variable}`);
    } else {
      cmds.push(`echo "${label}"`);
      cmds.push(`${variable}=$(${cmd})`);
      cmds.push(`echo "VALUE of ${variable} WAS $${variable}"`);
    }
  };

  for (const file of buildFiles) {
    if (musicDriver === "huge" && file.indexOf("GBT_PLAYER") !== -1) {
      continue;
    }
    if (musicDriver !== "huge" && file.indexOf("HUGE_TRACKER") !== -1) {
      continue;
    }

    const objFile = `${file
      .replace(/src.*\//, "obj/")
      .replace(/\.[cs]$/, "")}.o`;

    if (!(await pathExists(objFile))) {
      addCommand(
        `${l10n("COMPILER_COMPILING")}: ${Path.relative(buildRoot, file)}`,
        `${CC} ${CFLAGS} -c -o ${Path.relative(buildRoot, objFile)} ${Path.relative(buildRoot, file)}`
      );
    }
    objFiles.push(objFile);
  }

  getValue(
    `${l10n("COMPILER_PACKING")}`,
    "CART_SIZE",
    `${PACK} -f 255 -b 4 -e rel -c ${objFiles.map((o)=>Path.relative(buildRoot, o)).join(" ")}`
  );

  if (platform === "win32") {
    addCommand(
      l10n("COMPILER_CALCULATING_START_SAVE"),
      `SET /A "START_SAVE = CART_SIZE - 4"`
    );
    addCommand(
      `${l10n("COMPILER_LINKING")}: game.gb`,
      `${CC} ${LFLAGS} -Wl-yo%CART_SIZE% -Wl-g__start_save=%START_SAVE% -o build/rom/game.gb ${objFiles
        .map((file) => Path.relative(buildRoot, file).replace(/\.o$/, ".rel"))
        .join(" ")}`
    );
  } else {
    addCommand(
      `${l10n("COMPILER_LINKING")}: game.gb`,
      `${CC} ${LFLAGS} -Wl-yo\${CART_SIZE} -Wl-g__start_save=\${CART_SIZE-4} -o build/rom/game.gb ${objFiles
        .map((file) => Path.relative(buildRoot, file).replace(/\.o$/, ".rel"))
        .join(" ")}`
    );
  }

  return cmds.join("\n");
};

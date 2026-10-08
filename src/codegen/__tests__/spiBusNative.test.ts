import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'vitest'
import { SPI_BUS_CPP } from '../helpers/spiBusCpp'
import { TFT_TOUCH_CPP_HELPERS } from '../displays/tftTouchCpp'

const nativeGpp = spawnSync('g++', ['--version']).status === 0
const wslGpp = !nativeGpp && process.platform === 'win32'
  && spawnSync('wsl', ['--exec', 'g++', '--version']).status === 0
const compilerPath = (value: string) => wslGpp
  ? value.replace(/\\/g, '/').replace(/^([a-z]):/i, (_, drive: string) => `/mnt/${drive.toLowerCase()}`)
  : value

describe.skipIf(!nativeGpp && !wslGpp)('shared SPI host execution', () => {
  it('adds MISO once, preserves it for later panels and brackets touch reads in their own transaction', () => {
    const directory = path.resolve(mkdtempSync(path.join(tmpdir(), 'spi-bus-')))
    if (!directory.startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unexpected native-test directory')
    try {
      const source = path.join(directory, 'spi.cpp')
      const binary = path.join(directory, nativeGpp && process.platform === 'win32' ? 'spi.exe' : 'spi')
      const read = TFT_TOUCH_CPP_HELPERS.slice(0, TFT_TOUCH_CPP_HELPERS.indexOf('\n/*'))
      writeFileSync(source, `#include <cstdint>
#include <cassert>
#define ESP32
#define SPI_HAS_TRANSACTION
enum { MSBFIRST, SPI_MODE0, LOW, HIGH };
struct SPISettings { SPISettings(int hz, int, int) { assert(hz == 2000000); } };
struct MockSPI {
  int begins = 0, ends = 0, sck = -1, miso = -1, mosi = -1;
  bool transaction = false;
  void begin(int clock, int input, int output, int ss) {
    assert(!transaction && ss == -1); ++begins; sck = clock; miso = input; mosi = output;
  }
  void end() { assert(!transaction); ++ends; }
  void beginTransaction(SPISettings) { assert(!transaction); transaction = true; }
  void endTransaction() { assert(transaction); transaction = false; }
  void transfer(uint8_t command) { assert(transaction && command == 0xD0); }
  uint16_t transfer16(uint16_t word) { assert(transaction && word == 0); return 0x5A58; }
} SPI;
int selects = 0;
void digitalWrite(uint8_t pin, int level) {
  assert(pin == 6 && SPI.transaction);
  assert(level == (selects++ == 0 ? LOW : HIGH));
}
int digitalRead(uint8_t) { assert(false); return 0; }
${SPI_BUS_CPP}
${SPI_BUS_CPP}
${read}
int main(int argc, char **) {
  if (argc == 1) {
    _spiBusBegin(12, -1, 11);
    _spiBusBegin(12, -1, 11);
    assert(SPI.begins == 1 && SPI.ends == 0 && SPI.miso == -1);
    _spiBusBegin(12, 13, 11);
    assert(SPI.begins == 2 && SPI.ends == 1);
  } else {
    _spiBusBegin(12, 13, 11);
  }
  int begins = SPI.begins;
  _spiBusBegin(12, -1, 11);
  _spiBusBegin(12, 13, 11);
  assert(SPI.begins == begins && SPI.sck == 12 && SPI.miso == 13 && SPI.mosi == 11);
  assert(_xptRead12(6, 255, 255, 255, 0xD0) == 0xB4B);
  assert(selects == 2 && !SPI.transaction);
}
`)
      const args = ['-std=c++17', '-Wall', '-Wextra', '-Werror', source, '-o', binary]
      execFileSync(wslGpp ? 'wsl' : 'g++', wslGpp ? ['--exec', 'g++', ...args.map(compilerPath)] : args)
      for (const args of [[], ['reader-first']]) {
        execFileSync(wslGpp ? 'wsl' : binary, wslGpp ? ['--exec', compilerPath(binary), ...args] : args)
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }, 60_000)
})

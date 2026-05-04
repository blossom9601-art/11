#!/usr/bin/env bash
set -eu
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOP="${TOP:-/tmp/lumina-gate-rpmbuild-wsl}"
rm -rf "${TOP}"
mkdir -p "${TOP}/BUILD" "${TOP}/RPMS/x86_64" "${TOP}/SOURCES" "${TOP}/SPECS" "${TOP}/SRPMS" "${TOP}/BUILDROOT"
cp "${ROOT}/agents/lumina_gate/linux/lumina-gate" "${TOP}/SOURCES/lumina-gate"
chmod 755 "${TOP}/SOURCES/lumina-gate"
cp "${ROOT}/agents/lumina_gate/linux/config.yaml" "${TOP}/SOURCES/config.yaml"
chmod 640 "${TOP}/SOURCES/config.yaml"
cp "${ROOT}/agents/lumina_gate/linux/lumina-gate.service" "${TOP}/SOURCES/lumina-gate.service"
cp "${ROOT}/deploy/rpm/lumina-gate.spec" "${TOP}/SPECS/lumina-gate.spec"
for f in "${TOP}/SPECS/lumina-gate.spec" "${TOP}/SOURCES/lumina-gate.service" "${TOP}/SOURCES/config.yaml"; do
  sed -i 's/\r$//' "$f"
done
rpmbuild --define "_topdir ${TOP}" -bb "${TOP}/SPECS/lumina-gate.spec"
OUTDIR="${ROOT}/deploy/rpm/RPMS"
mkdir -p "${OUTDIR}"
RPM="$(ls -1 "${TOP}/RPMS/x86_64"/lumina-gate-*.x86_64.rpm | head -1)"
cp -f "${RPM}" "${OUTDIR}/"
echo "OK: ${OUTDIR}/$(basename "${RPM}")"

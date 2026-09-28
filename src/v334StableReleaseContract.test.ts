import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const workflow=fs.readFileSync('.github/workflows/vyron-334-stable-release.yml','utf8');

describe('VYRON 3.3.4 stable release freeze contract',()=>{
  it('is manual-only and requires the exact owner phrase',()=>{
    const onBlock=workflow.slice(workflow.indexOf('on:'),workflow.indexOf('permissions:'));
    expect(onBlock).toContain('workflow_dispatch:');
    expect(onBlock).not.toContain('push:');
    expect(workflow).toContain("test \"${{ inputs.confirmation }}\" = 'ВЫПУСКАЕМ'");
  });

  it('is pinned to the exact GREEN signed candidate run and app source',()=>{
    expect(workflow).toContain('APPROVED_HEAD: 640c1978978583bfc5f07f132306ee96b82131cb');
    expect(workflow).toContain("APPROVED_RUN_ID: '36382983040'");
    expect(workflow).toContain("d['conclusion']=='success'");
    expect(workflow).toContain('Signed macOS ARM64 candidate');
    expect(workflow).toContain('Signed Windows x64 candidate');
    expect(workflow).toContain('Final production freeze proof');
  });

  it('requires old production feeds before publishing 3.3.4',()=>{
    expect(workflow).toContain("assert m['version']=='3.3.3'");
    expect(workflow).toContain("assert w['version']=='3.3.2'");
  });

  it('verifies exact candidate hashes and allows safe rerun recovery',()=>{
    expect(workflow).toContain("sed 's#candidate-macos/##' VYRON-3.3.4-macOS-arm64-CANDIDATE.dmg.sha256");
    expect(workflow).toContain("sed 's#candidate-macos/##' VYRON-3.3.4.app.tar.gz.sha256");
    expect(workflow).toContain('sha256sum -c VYRON_3.3.4_x64-setup.exe.sha256');
    expect(workflow).toContain('gh release upload \"$TAG\" --repo \"$RELEASE_REPO\" --clobber');
  });

  it('verifies remote asset byte identity before updater feed promotion',()=>{
    const verify=workflow.indexOf('Verify exact public release assets before feed promotion');
    const macCmp=workflow.indexOf('cmp -s stable/VYRON.app.tar.gz');
    const winCmp=workflow.indexOf('cmp -s stable/VYRON_3.3.4_x64-setup.exe');
    const promote=workflow.indexOf('Promote both platform updater feeds');
    expect(verify).toBeGreaterThan(0);
    expect(macCmp).toBeGreaterThan(verify);
    expect(winCmp).toBeGreaterThan(verify);
    expect(promote).toBeGreaterThan(macCmp);
    expect(promote).toBeGreaterThan(winCmp);
  });

  it('promotes macOS and Windows separately to the same stable version',()=>{
    expect(workflow).toContain("Path('stable/latest.json')");
    expect(workflow).toContain("Path('stable/windows-latest.json')");
    expect(workflow).toContain("assert m['version']=='3.3.4'");
    expect(workflow).toContain("assert w['version']=='3.3.4'");
    expect(workflow).toContain("set(m['platforms'])=={'darwin-aarch64'}");
    expect(workflow).toContain("set(w['platforms'])=={'windows-x86_64'}");
  });
});

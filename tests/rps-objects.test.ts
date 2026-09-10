import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createRpsObjects} from '../client/prototypes/factory25dRpsObjects';
import type {AgentEffect} from '../client/prototypes/factory25dEffectsState';
import type {RpsChoice,RpsOutcome} from '../shared/types';
const effect=(choice:RpsChoice,outcome:RpsOutcome):AgentEffect=>({id:1,sessionId:'a',opponentSessionId:'b',kind:'rps',startedAt:1000,duration:3900,facing:'down',choice,outcome});
const anchor={x:0,y:0,z:0},opponent={x:.9,y:0,z:0};
describe('modeled RPS rounds',()=>{
 it.each(['rock','paper','scissors'] as const)('%s retains finite lit geometry across every round phase',choice=>{
  const factory=createRpsObjects(),model=factory.create();
  for(const outcome of ['win','lose','draw'] as const)for(let age=0;age<3900;age+=100){
   model.update(effect(choice,outcome),1000+age,opponent,anchor,false);
   model.root.updateMatrixWorld(true);
   model.root.traverse(node=>{expect(node.matrixWorld.elements.every(Number.isFinite)).toBe(true);if(node instanceof THREE.Mesh){expect(node.material).toBeInstanceOf(THREE.MeshStandardMaterial);expect([...node.geometry.attributes.position.array].every(Number.isFinite)).toBe(true);}});
  }
  model.dispose();factory.dispose();
 });
 it('brings the winning rock to the other player and breaks the losing scissors apart',()=>{
  const factory=createRpsObjects(),rock=factory.create(),scissors=factory.create();
  rock.update(effect('rock','win'),4200,opponent,anchor,false);
  expect(rock.root.position.x).toBeCloseTo(.9);
  scissors.update(effect('scissors','lose'),4200,anchor,opponent,false);
  const prop=scissors.root.children[0].children[2];
  expect(prop.children[0].position.x).toBeLessThan(0);expect(prop.children[1].position.x).toBeGreaterThan(0);expect(prop.children[2].visible).toBe(false);
  rock.dispose();scissors.dispose();factory.dispose();
 });
 it('folds winning paper around rock, and separates cut paper into two pieces',()=>{
  const factory=createRpsObjects(),model=factory.create();
  model.update(effect('paper','win'),4200,opponent,anchor,false);
  const paper=model.root.children[0].children[1],sheet=paper.children[0] as THREE.Mesh;
  const z=[...sheet.geometry.attributes.position.array].filter((_,i)=>i%3===2);
  expect(Math.max(...z)-Math.min(...z)).toBeGreaterThan(.2);
  model.update(effect('paper','lose'),4200,opponent,anchor,false);
  expect(paper.children[0].position.x).toBeLessThan(-.1);expect(paper.children[1].position.x).toBeGreaterThan(.1);
  model.dispose();factory.dispose();
 });
 it('removes pumping, strikes and breakup for reduced motion',()=>{
  const factory=createRpsObjects(),model=factory.create();
  model.update(effect('rock','win'),4100,opponent,anchor,true);
  expect(model.root.position.x).toBe(0);expect(model.root.children[0].rotation.x).toBe(0);
  model.update(effect('scissors','lose'),4200,opponent,anchor,true);
  expect(model.root.children[0].children[2].children[2].visible).toBe(true);
  model.dispose();factory.dispose();
 });
});

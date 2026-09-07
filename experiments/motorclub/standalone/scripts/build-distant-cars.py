import bpy
from pathlib import Path
source=Path('/Users/britonbaker/Code/agent-factory-garage-study/public/models')
output=Path('/Users/britonbaker/Code/agent-factory-25d-preview-push/client/assets/prototype25d/garage-distant-cars.glb')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
shared=bpy.data.materials.new('factory car albedo');shared.use_nodes=True
bsdf=shared.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.9
color=shared.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='Color'
shared.node_tree.links.new(color.outputs['Color'],bsdf.inputs['Base Color'])
for name in ['porsche','mini','delorean','f1']:
 before=set(bpy.data.objects)
 bpy.ops.import_scene.gltf(filepath=str(source/(name+'.glb')))
 added=set(bpy.data.objects)-before;meshes=[o for o in added if o.type=='MESH'];empty_names=[o.name for o in added if o.type!='MESH']
 for obj in meshes:
  attribute=obj.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
  for face in obj.data.polygons:
   material=obj.data.materials[face.material_index] if len(obj.data.materials)>face.material_index else None
   rgba=(.5,.5,.5,1)
   if material:
    shader=material.node_tree.nodes.get('Principled BSDF') if material.use_nodes else None
    rgba=tuple(shader.inputs['Base Color'].default_value) if shader else tuple(material.diffuse_color)
   for loop in face.loop_indices:attribute.data[loop].color=(*rgba[:3],1)
  obj.data.materials.clear();obj.data.materials.append(shared)
 bpy.ops.object.select_all(action='DESELECT')
 for obj in meshes:obj.select_set(True)
 bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();car=bpy.context.object;car.name=name
 # Keep world-space assembly while removing wheel/door authoring hierarchies.
 matrix=car.matrix_world.copy();car.parent=None;car.matrix_world=matrix
 decimate=car.modifiers.new('distant silhouette','DECIMATE');decimate.ratio=.18
 bpy.ops.object.modifier_apply(modifier=decimate.name)
 bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 for empty_name in empty_names:
  obj=bpy.data.objects.get(empty_name)
  if obj:bpy.data.objects.remove(obj,do_unlink=True)
 car.name=name
 print(name,len(car.data.polygons))
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_yup=True,export_cameras=False,export_lights=False)
print('wrote',output,output.stat().st_size)

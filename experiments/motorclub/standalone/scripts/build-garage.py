"""Fluid Factory car study. Blender is an authoring tool; game assets are GLBs.

Coordinates: Blender Z up, front -Y. Export: Y up, front +Z, wheel axle X.
Each car has independent steering, wheel, door, driver-seat and entry nodes.
These are original stylized studies, not dimensionally exact manufacturer models.
"""
import bpy
import json
import math
import os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'models')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, roughness=.76, metal=.03, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = roughness
    bs.inputs['Metallic'].default_value = metal
    if emission:
        bs.inputs['Emission Color'].default_value = (*color, 1)
        bs.inputs['Emission Strength'].default_value = emission
    return m

def hexrgb(v):
    rgb = [int(v[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x/12.92 if x < .04045 else ((x+.055)/1.055)**2.4 for x in rgb)

def mat(n,c,r=.76,m=.03,e=0): return material(n,hexrgb(c),r,m,e)
rubber=mat('Tire · soft charcoal','191b26',.96)
trim=mat('Trim · factory ink','292b3b',.88)
glass=mat('Glass · quiet blue','334d66',.28,.16)
alloy=mat('Wheel alloy','aaaeb7',.48,.55)
darkalloy=mat('Recessed metal','555b6a',.68,.35)
cream=mat('Porsche · ivory','e9dbb3',.63,.08)
mini_green=mat('Mini · racing green','32684f',.74)
white=mat('Warm roof white','e7e3d1',.85)
silver=mat('DeLorean · brushed steel','a0a8b2',.61,.48)
f1paint=mat('F1 · racing coral','dd5144',.64)
seatmat=mat('Seat · oxblood','653b3e',.98)
lamp=mat('Headlamp · warm glass','f0e5be',.42,.06,.35)
taillamp=mat('Tail lamp','be303f',.5,.04,.4)
cyan=mat('Time circuit blue','62cedb',.5,.04,.8)
gold=mat('Brake caliper','bc8937',.68)

def empty(name,pos=(0,0,0),parent=None,**extras):
    o=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(o)
    o.location=pos
    o.parent=parent
    for k,v in extras.items(): o[k]=v
    return o

def bevel(o,width=.025,segments=2):
    if not width:return
    m=o.modifiers.new('Small sculpted edge','BEVEL');m.width=width;m.segments=segments
    m=o.modifiers.new('Broad face normals','WEIGHTED_NORMAL');m.keep_sharp=True;m.weight=30

def mesh(name,verts,faces,ma,parent=None,bev=0):
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o)
    o.parent=parent;o.data.materials.append(ma)
    # Keep authored broad planes rather than random per-triangle colors.
    bevel(o,bev)
    return o

def box(name,pos,size,ma,parent=None,bev=.015,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    o=bpy.context.object;o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.rotation_euler=rot;o.parent=parent;o.data.materials.append(ma);bevel(o,bev)
    return o

def cylinder(name,pos,radius,depth,ma,parent=None,vertices=16,rot=(0,math.pi/2,0),bev=.007):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=pos,rotation=rot)
    o=bpy.context.object;o.name=name;o.parent=parent;o.data.materials.append(ma);bevel(o,bev)
    return o

def beam(name,a,b,r,ma,parent=None):
    av,bv=Vector(a),Vector(b);delta=bv-av
    o=cylinder(name,(av+bv)/2,r,delta.length,ma,parent,8,rot=(0,0,0),bev=0)
    o.rotation_euler=delta.to_track_quat('Z','Y').to_euler();return o

def loft(name,rows,ma,parent,bev=.025):
    # Cross-sections: y, half width, lower surface, shoulder height, crown height.
    vertices=[]
    for y,w,b,s,t in rows:
        vertices.extend([(w*.91,y,b),(w,y,b+.07),(w,y,s),(w*.76,y,t),
                         (-w*.76,y,t),(-w,y,s),(-w,y,b+.07),(-w*.91,y,b)])
    faces=[tuple(reversed(range(8)))]
    for j in range(len(rows)-1):
        for k in range(8):faces.append((j*8+k,j*8+(k+1)%8,(j+1)*8+(k+1)%8,(j+1)*8+k))
    faces.append(tuple((len(rows)-1)*8+k for k in range(8)))
    o=mesh(name,vertices,faces,ma,parent)
    # Recalculate consistently for boolean wheel arches.
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    o.select_set(False);bevel(o,bev);return o

def arches(body,axles,r):
    for axle in axles:
        for side in [-1,1]:
            # Wheel wells stop at the inside fender; never tunnel through the hood.
            x=side*(.49 if r < .29 else .59)
            cutter=cylinder('temporary wheel arch',(x,axle,r),r+.035,.32,trim,vertices=20,bev=0)
            cut(body,cutter,'True open wheel arch')

def cut(body,cutter,name):
    mod=body.modifiers.new(name,'BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
    bpy.context.view_layer.objects.active=body
    bpy.ops.object.modifier_move_up(modifier=mod.name)
    bpy.ops.object.modifier_move_up(modifier=mod.name)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter,do_unlink=True)

def cabin_recess(body,width=.75):
    cutter=box('temporary cabin interior',(0,.045,.85),(width,1.0,1.0),trim,bev=0)
    cut(body,cutter,'Actual recessed cabin')

def wheels(root,axles,halfwidth,r=.32,t=.20,style='alloy'):
    for axname,y in zip(['front','rear'],axles):
        for side,x in [('left',-halfwidth),('right',halfwidth)]:
            sign=1 if x>0 else -1
            steering=empty('steering_'+axname+'_'+side,(x,y,r),root,role='steering',axle=axname)
            wheel=empty('wheel_'+axname+'_'+side,parent=steering,role='wheel',radius=r)
            cylinder('tire_'+axname+'_'+side,(0,0,0),r,t,rubber,wheel,20,bev=.018)
            cylinder('rim_recess',(sign*(t/2+.003),0,0),r*.70,.014,darkalloy,wheel,16)
            if style=='f1':
                cylinder('carbon_disc',(sign*(t/2+.015),0,0),r*.64,.018,trim,wheel,16)
                cylinder('center_lock',(sign*(t/2+.035),0,0),r*.14,.032,gold,wheel,8)
                # Sidewall marks are geometry, independent of lighting.
                for a in [0,math.pi]:
                    box('sidewall_mark',(sign*(t/2+.014),math.cos(a)*r*.84,math.sin(a)*r*.84),(.018,.11,.028),white,wheel,0)
            else:
                for i in range(5 if style!='mini' else 8):
                    a=i*2*math.pi/(5 if style!='mini' else 8)
                    spoke=box('sculpted_spoke',(sign*(t/2+.025),math.cos(a)*r*.32,math.sin(a)*r*.32),(.025,r*.54,r*.115),alloy,wheel,.008)
                    spoke.rotation_euler.x=a
                cylinder('center_cap',(sign*(t/2+.045),0,0),r*.15,.025,alloy,wheel,12)
            cylinder('brake_disc',(-sign*t*.4,0,0),r*.63,.026,darkalloy,wheel,16)

def cockpit(root,y,z,width=.62,length=.68):
    for x in [-width*.28,width*.28]:
        box('seat_cushion',(x,y,z),(.25,length*.62,.10),seatmat,root,.035)
        box('seat_back',(x,y+length*.3,z+.20),(.25,.095,.39),seatmat,root,.045,rot=(.12,0,0))
    box('dashboard',(0,y-length*.52,z+.22),(width,.14,.12),trim,root,.02)
    cylinder('steering_wheel',(-width*.28,y-length*.3,z+.31),.11,.025,trim,root,12,rot=(math.pi/2+.45,0,0))
    empty('driver_seat',(-width*.28,y,z+.18),root,role='driver_socket')
    empty('entry_left',(-width*.9-.44,y,0),root,role='entry_socket')

def badge(root,pos,label,color=white):
    box(label,pos,(.15,.018,.075),color,root,.008)

def porsche():
    root=empty('porsche',role='vehicle',front='+Z',study='Porsche-inspired track coupe')
    ax=[-.78,.77];r=.315
    body=loft('ivory_body',[(-1.34,.39,.22,.42,.47),(-1.17,.55,.21,.55,.56),(-.78,.585,.20,.715,.65),(-.3,.55,.20,.59,.62),(.38,.56,.20,.61,.64),(.77,.61,.21,.745,.72),(1.19,.54,.26,.60,.63),(1.32,.43,.29,.51,.53)],cream,root,.035)
    arches(body,ax,r)
    cabin_recess(body)
    loft('blue_glasshouse',[(-.49,.41,.59,.62,.65),(-.17,.42,.60,.87,.98),(.32,.42,.61,.9,1.025),(.64,.44,.62,.80,.90),(.89,.44,.64,.68,.72)],glass,root,.015)
    loft('curved_roof',[(-.16,.32,.955,.97,1.005),(.22,.34,1.005,1.025,1.04),(.48,.31,.935,.96,.98)],cream,root,.02)
    for side in [-1,1]:
        beam('A_pillar',(side*.414,-.47,.64),(side*.33,-.16,.99),.025,cream,root)
        beam('B_pillar',(side*.445,.37,.68),(side*.33,.35,1.0),.024,cream,root)
        door=empty('door_'+('left' if side<0 else 'right'),(side*.55,-.30,.36),root,role='door',openAxis='y',openAngle=side*.85)
        box('door_panel',(0,.26,.055),(.035,.60,.27),cream,door,.018)
        box('door_handle',(side*.025,.41,.16),(.022,.10,.021),darkalloy,door,.006)
        box('mirror_stalk',(side*.56,-.30,.72),(.13,.032,.024),trim,root)
        box('mirror',(side*.64,-.31,.755),(.12,.11,.065),cream,root,.025)
        cylinder('round_headlight',(side*.405,-1.155,.565),.12,.037,darkalloy,root,16,rot=(math.pi/2-.38,0,0))
        cylinder('headlight_lens',(side*.405,-1.171,.574),.097,.038,lamp,root,16,rot=(math.pi/2-.38,0,0))
        box('front_intake',(side*.35,-1.265,.34),(.24,.08,.085),trim,root)
        box('tail_light',(side*.38,1.248,.535),(.26,.032,.06),taillamp,root,.008)
        box('wing_stanchion',(side*.36,.97,.81),(.035,.095,.34),trim,root)
        cylinder('exhaust',(side*.30,1.3,.285),.047,.09,darkalloy,root,10,rot=(math.pi/2,0,0))
    box('rear_wing',(0,.99,.992),(1.28,.24,.055),cream,root,.02)
    box('front_splitter',(0,-1.28,.24),(1.02,.22,.038),trim,root,.012)
    box('rear_light_bridge',(0,1.276,.548),(.55,.026,.027),taillamp,root,.003)
    for y in [.83,.89,.95]:box('engine_louver',(0,y,.747),(.57,.021,.017),trim,root,.003)
    cockpit(root,.10,.39)
    wheels(root,ax,.558,r)
    return root

def mini():
    root=empty('mini',role='vehicle',front='+Z',study='Classic Mini Cooper-inspired city car')
    ax=[-.64,.61];r=.265
    body=loft('green_body',[(-1.025,.36,.19,.51,.55),(-.90,.47,.18,.65,.69),(-.52,.48,.17,.66,.69),(.65,.48,.18,.66,.69),(.94,.44,.20,.61,.64),(1.01,.39,.23,.55,.59)],mini_green,root,.035)
    arches(body,ax,r)
    cabin_recess(body,.70)
    loft('upright_glasshouse',[(-.51,.418,.66,.77,.86),(-.34,.399,.67,1.07,1.12),(.57,.408,.67,1.07,1.12),(.78,.421,.66,.81,.86)],glass,root,.02)
    box('white_floating_roof',(0,.115,1.12),(.90,1.04,.10),white,root,.055)
    for side in [-1,1]:
        beam('A_pillar',(side*.424,-.51,.69),(side*.402,-.35,1.13),.031,mini_green,root)
        beam('C_pillar',(side*.427,.78,.68),(side*.407,.58,1.13),.037,mini_green,root)
        box('B_pillar',(side*.416,.28,.898),(.038,.047,.42),mini_green,root,.008)
        door=empty('door_'+('left' if side<0 else 'right'),(side*.48,-.40,.32),root,role='door',openAxis='y',openAngle=side*.95)
        box('door_panel',(0,.32,.135),(.034,.66,.30),mini_green,door,.016)
        box('bright_handle',(side*.025,.55,.27),(.03,.12,.028),alloy,door,.005)
        cylinder('headlight_surround',(side*.314,-.979,.58),.117,.055,alloy,root,16,rot=(math.pi/2,0,0))
        cylinder('round_headlamp',(side*.314,-1.011,.58),.091,.035,lamp,root,16,rot=(math.pi/2,0,0))
        box('mirror',(side*.525,-.38,.83),(.105,.067,.074),alloy,root,.023)
        box('tail_light',(side*.34,.982,.55),(.092,.035,.16),taillamp,root,.012)
    box('front_grille',(0,-1.032,.465),(.45,.038,.17),trim,root,.018)
    for z in [.40,.445,.49,.535]:box('grille_slats',(0,-1.057,z),(.42,.019,.015),alloy,root,.001)
    box('chrome_front_bumper',(0,-1.04,.305),(.90,.078,.05),alloy,root,.014)
    box('chrome_rear_bumper',(0,1.035,.305),(.89,.065,.05),alloy,root,.014)
    badge(root,(0,-1.083,.325),'front_plate',trim)
    cockpit(root,.07,.38,.65,.65)
    wheels(root,ax,.455,r,.17,'mini')
    return root

def delorean():
    root=empty('delorean',role='vehicle',front='+Z',study='DeLorean time-machine-inspired coupe')
    ax=[-.78,.76];r=.305
    body=loft('stainless_wedge',[(-1.39,.47,.22,.37,.40),(-1.24,.59,.20,.45,.49),(-.72,.60,.19,.56,.59),(.42,.61,.20,.62,.64),(1.19,.61,.22,.57,.60),(1.36,.52,.27,.49,.53)],silver,root,.016)
    arches(body,ax,r)
    cabin_recess(body,.81)
    # Closed windshield and cabin back stay fixed. Gullwing roof and side panel
    # form one rigid assembly per side with a hinge running along the roof.
    mesh('windshield',[(-.47,-.62,.595),(.47,-.62,.595),(.39,-.16,.935),(-.39,-.16,.935)],[(0,1,2,3)],glass,root)
    box('roof_spine',(0,.22,.961),(.15,.78,.048),silver,root)
    for side in [-1,1]:
        door=empty('door_'+('left' if side<0 else 'right'),(side*.073,.19,.943),root,role='door',openAxis='z',openAngle=side*1.10,gullwing=True)
        # Local coords relative to hinge. Side and roof geometry open together.
        def dpos(x,y,z):return (side*x-side*.073,y-.19,z-.943)
        mesh('gullwing_roof',[dpos(.07,-.15,.959),dpos(.39,-.15,.939),dpos(.43,.61,.906),dpos(.07,.61,.959)],[(0,1,2,3)],silver,door,.008)
        mesh('gullwing_window',[dpos(.39,-.15,.935),dpos(.43,.61,.902),dpos(.57,.57,.62),dpos(.55,-.54,.59)],[(0,1,2,3)],glass,door)
        mesh('gullwing_side',[dpos(.55,-.54,.59),dpos(.57,.57,.62),dpos(.584,.60,.34),dpos(.574,-.53,.34)],[(0,1,2,3)],silver,door,.012)
        for a,b in [((.39,-.15,.935),(.55,-.54,.59)),((.43,.61,.902),(.57,.57,.62)),((.55,-.54,.59),(.57,.57,.62))]:
            beam('door_frame',dpos(*a),dpos(*b),.019,silver,door)
        box('door_rub_strip',dpos(.595,.02,.405),(.022,1.05,.04),trim,door,.004)
        box('door_handle',dpos(.602,.38,.535),(.024,.12,.04),trim,door,.004)
        # Film-inspired exposed wiring follows the fenders into the rear deck.
        points=[(side*.60,-1.05,.53),(side*.65,-.68,.68),(side*.65,.60,.69),(side*.63,1.14,.68)]
        for a,b in zip(points,points[1:]):beam('time_circuit_conduit',a,b,.024,trim,root)
        for a,b in zip(points,points[1:]):beam('blue_conduit',tuple(v+(.028 if i==2 else 0) for i,v in enumerate(a)),tuple(v+(.028 if i==2 else 0) for i,v in enumerate(b)),.008,cyan,root)
        box('headlamp_bezel',(side*.365,-1.365,.414),(.40,.049,.12),trim,root,.008)
        for x in [.26,.46]:box('square_headlamp',(side*x,-1.395,.415),(.16,.022,.081),lamp,root,.006)
        box('rear_vent_housing',(side*.39,1.01,.78),(.32,.50,.34),trim,root,.025,rot=(.18,0,0))
        for y in [.83,.94,1.05,1.16]:box('reactor_vent_fin',(side*.39,y,.971),(.29,.036,.025),darkalloy,root,.003)
        box('rear_lamps',(side*.37,1.335,.456),(.34,.035,.10),taillamp,root,.004)
    box('front_rub_strip',(0,-1.393,.30),(1.04,.07,.082),trim,root,.012)
    box('rear_equipment_plate',(0,.86,.69),(1.08,.73,.08),darkalloy,root)
    cylinder('reactor_base',(0,.90,.80),.14,.18,silver,root,12,rot=(0,0,0))
    cylinder('reactor_cap',(0,.90,.915),.105,.09,white,root,12,rot=(0,0,0))
    box('flux_capacitor_case',(0,.54,.83),(.22,.09,.27),trim,root)
    for a,b in [((0,.484,.86),(-.066,.484,.93)),((0,.484,.86),(.066,.484,.93)),((0,.484,.86),(0,.484,.77))]:beam('flux_Y',a,b,.01,cyan,root)
    cockpit(root,.07,.39,.76,.64)
    wheels(root,ax,.583,r,.19)
    return root

def f1():
    root=empty('f1',role='vehicle',front='+Z',study='Open-wheel Formula-inspired racer')
    ax=[-.96,.91];r=.335
    loft('sculpted_monocoque',[(-1.57,.13,.22,.27,.30),(-.92,.19,.24,.43,.48),(-.37,.28,.20,.52,.60),(.26,.30,.20,.48,.59),(.68,.24,.20,.62,.77),(1.30,.19,.22,.40,.48)],f1paint,root,.018)
    box('flat_floor',(0,.32,.15),(1.10,1.95,.055),trim,root,.01)
    for side in [-1,1]:
        loft('sculpted_sidepod',[(-.24,.17,.18,.43,.48),(.05,.24,.18,.44,.49),(.67,.20,.18,.34,.42),(.93,.13,.19,.27,.32)],f1paint,root,.03).location.x=side*.38
        box('sidepod_intake',(side*.39,-.26,.365),(.30,.045,.12),trim,root,.014)
        for y in ax:
            for z in [.235,.38]:
                for offset in [-.18,.18]:beam('wishbone',(side*.22,y+offset,z),(side*.72,y,z-.015),.016,darkalloy,root)
        box('front_wing_endplate',(side*.76,-1.38,.31),(.045,.46,.25),f1paint,root,.008)
        box('rear_wing_endplate',(side*.56,1.26,.79),(.038,.39,.39),f1paint,root,.008)
        beam('halo_side',(side*.22,-.36,.64),(side*.25,.24,.76),.033,trim,root)
        box('mirror',(side*.39,-.35,.65),(.14,.09,.06),f1paint,root,.016)
        beam('mirror_stem',(side*.22,-.31,.57),(side*.39,-.35,.65),.012,trim,root)
        box('rear_wing_stay',(side*.18,1.14,.59),(.035,.08,.62),trim,root)
    for y,z in [(-1.52,.205),(-1.39,.235),(-1.25,.28)]:box('front_wing_flap',(0,y,z),(1.53,.125,.028),white if y==-1.39 else trim,root,.008,rot=(-.08,0,0))
    for z,y in [(.92,1.23),(.80,1.32)]:box('rear_wing_element',(0,y,z),(1.10,.26,.045),white,root,.012,rot=(.12,0,0))
    box('cockpit_opening',(0,-.01,.60),(.39,.49,.035),trim,root,.10)
    box('driver_bucket',(0,.025,.63),(.25,.33,.047),seatmat,root,.055)
    beam('halo_crossbar',(-.25,.24,.76),(.25,.24,.76),.033,trim,root)
    beam('halo_center',(0,-.39,.61),(0,-.36,.83),.025,trim,root)
    for side in [-1,1]:beam('halo_front',(0,-.36,.83),(side*.25,.24,.76),.03,trim,root)
    loft('airbox',[ (.27,.095,.67,.84,.93),(.43,.12,.65,.82,.90),(.76,.075,.56,.63,.68)],f1paint,root,.01)
    box('airbox_intake',(0,.255,.827),(.125,.025,.13),trim,root,.023)
    empty('driver_seat',(0,0,.52),root,role='driver_socket')
    empty('entry_left',(-.72,0,0),root,role='entry_socket')
    wheels(root,ax,.73,r,.28,'f1')
    return root

builders=[porsche,mini,delorean,f1]
report=[]
for builder in builders:
    root=builder()
    # Hide other studies for individual export; nodes retain their identity.
    bpy.ops.object.select_all(action='DESELECT')
    objs=[root,*root.children_recursive]
    for o in objs:o.select_set(True)
    path=os.path.join(OUT,root.name+'.glb')
    bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,
        export_yup=True,export_extras=True,export_animations=False,export_apply=True,
        export_cameras=False,export_lights=False)
    triangles=0
    for o in objs:
        if o.type=='MESH':
            e=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh()
            m.calc_loop_triangles();triangles+=len(m.loop_triangles);e.to_mesh_clear()
    report.append({'id':root.name,'triangles':triangles,'objects':len(objs),'bytes':os.path.getsize(path),
                   'nodes':[o.name for o in objs if o.type=='EMPTY']})
    # Space out editable originals in the native Blender file.
    root.location.x=(len(report)-1)*3.2

bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'fluid-factory-cars.blend'))
with open(os.path.join(ROOT,'evidence','model-report.json'),'w') as f:json.dump(report,f,indent=2)
print('GARAGE_MODEL_REPORT '+json.dumps(report))

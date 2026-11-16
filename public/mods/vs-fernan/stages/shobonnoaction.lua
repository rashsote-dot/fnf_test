local Locate = 'stages/shobon worlds/'
local aparecemierda1 = true
local aparecemierda2 = true
local teveoelhoyo = true

function onCreate()
	--characters
	addCharacterToList('Fernan', 'dad')
	addCharacterToList('FernanBebe', 'dad')
	addCharacterToList('FernanRene', 'dad')
	addCharacterToList('FernanJumpeado', 'dad')
	addCharacterToList('Syobon', 'gf')
	addCharacterToList('Rene', 'gf')
	addCharacterToList('CebollaConPelo', 'boyfriend')
	addCharacterToList('Whoishe', 'boyfriend')
	
	--Precache images
	precacheImage(Locate..'w1-1')
	precacheImage(Locate..'w1-2')
	precacheImage(Locate..'trollingblock1')
	precacheImage(Locate..'w1-2In')
	precacheImage(Locate..'trollingblock2')
	precacheImage(Locate..'w1-4')
	precacheImage(Locate..'fireballs')
	precacheImage(Locate..'martillasoenelano')
	
	--Property
	setProperty('camGame.bgColor', getColorFromHex('000000'))
	
	--Sprites
	makeLuaSprite('bgColor', 'empty', -29, -29)
	makeGraphic('bgColor', 552, 359 + 58, 'FFFFFF')
	setProperty('bgColor.alpha', 0)
	setProperty('bgColor.visible', false)
	
	makeLuaSprite('box', 'empty', 425, 146)
	makeGraphic('box', 40, 40, '000000')
	--setProperty('box.visible', false)
	setProperty('box.alpha', 0)
	
	makeLuaSprite('martillolery', Locate..'martillasoenelano', 275, 154)
	setProperty('martillolery.antialiasing', false)
	setScrollFactor('martillolery', 1, 1)
	setProperty('martillolery.alpha', 0)
	
	makeLuaSprite('lv1', Locate..'w1-1', -29, 0)
	setProperty('lv1.antialiasing', false)
	setScrollFactor('lv1', 1, 1)
	setProperty('lv1.alpha', 0)
	
	makeLuaSprite('lv2', Locate..'w1-2', -29, -19)
	setProperty('lv2.antialiasing', false)
	setScrollFactor('lv2', 1, 1)
	setProperty('lv2.alpha', 1)
	
	makeLuaSprite('tb1', Locate..'trollingblock1', 174, -400)
	setProperty('tb1.antialiasing', false)
	setScrollFactor('tb1', 1, 1)
	setProperty('tb1.alpha', 1)
	
	makeLuaSprite('lv2In', Locate..'w1-2In', -29, -19)
	setProperty('lv2In.antialiasing', false)
	setScrollFactor('lv2In', 1, 1)
	setProperty('lv2In.alpha', 0)
	
	makeLuaSprite('tb2', Locate..'trollingblock2', 29, 300)
	setProperty('tb2.antialiasing', false)
	setScrollFactor('tb2', 1, 1)
	setProperty('tb2.alpha', 0)
	
	makeLuaSprite('lv4', Locate..'w1-4', -203, -77)
	setProperty('lv4.antialiasing', false)
	setScrollFactor('lv4', 1, 1)
	setProperty('lv4.alpha', 0)
	
	makeLuaSprite('fb1', Locate..'fireballs', -241.5, 10)
	setProperty('fb1.antialiasing', false)
	setScrollFactor('fb1', 1, 1)
	setProperty('fb1.alpha', 0)
	
	makeLuaSprite('fb2', Locate..'fireballs', -125.5, 155)
	setProperty('fb2.antialiasing', false)
	setScrollFactor('fb2', 1, 1)
	setProperty('fb2.alpha', 0)
	
	makeLuaSprite('fb3', Locate..'fireballs', 310.5, 10)
	setProperty('fb3.antialiasing', false)
	setScrollFactor('fb3', 1, 1)
	setProperty('fb3.alpha', 0)
	
	--Add Sprites
	addLuaSprite('bgColor', false)
	addLuaSprite('lv1', true)
	addLuaSprite('martillolery', true)
	addLuaSprite('lv2', false)
	addLuaSprite('tb1', false)
	addLuaSprite('lv2In', true)
	addLuaSprite('tb2', true)
	addLuaSprite('lv4', true)
	addLuaSprite('fb1', true)
	addLuaSprite('fb2', true)
	addLuaSprite('fb3', true)
	addLuaSprite('box', true)
end

function onEvent(name, value1, value2)
	if name == 'levels' then
		if value1 == '0' then
			setProperty('camGame.bgColor', getColorFromHex('000000'))
			setProperty('bgColor.visible', false)
			setProperty('RightBar.visible', false)
			setProperty('LeftBar.visible', false)
			setProperty('bgColor.alpha', 0)
			setProperty('lv1.alpha', 0)
			setProperty('lv2.alpha', 0)
			setProperty('lv2In.alpha', 0)
			setProperty('lv4.alpha', 0)
			setProperty('fb1.alpha', 0)
			setProperty('fb2.alpha', 0)
			setProperty('fb3.alpha', 0)
			setProperty('box.alpha', 1)
			
			setProperty('boyfriendGroup.x', 425)
			setProperty('boyfriendGroup.y', 144)
			
			setProperty('gfGroup.visible', false)
			
				if aparecemierda1 == true then
					setProperty('tb1.alpha', 0)
				else
					setProperty('tb1.visible', false)
				end
			
				if aparecemierda2 == true then
					setProperty('tb2.alpha', 0)
				else
					setProperty('tb2.visible', false)
				end
			
		elseif value1 == '1' then
			setProperty('camGame.bgColor', getColorFromHex('A0B4FA'))
			setProperty('bgColor.visible', true)
			setProperty('RightBar.visible', true)
			setProperty('LeftBar.visible', true)
			setProperty('bgColor.alpha', 1)
			setProperty('lv1.alpha', 1)
			setProperty('lv2.alpha', 0)
			setProperty('lv2In.alpha', 0)
			setProperty('lv4.alpha', 0)
			setProperty('fb1.alpha', 0)
			setProperty('fb2.alpha', 0)
			setProperty('fb3.alpha', 0)
			setProperty('box.alpha', 0)
			
			setProperty('boyfriendGroup.x', 257)
			setProperty('boyfriendGroup.y', 150)
			
			setProperty('gfGroup.visible', false)
			
				if aparecemierda1 == true then
					setProperty('tb1.alpha', 0)
				else
					setProperty('tb1.visible', false)
				end
			
				if aparecemierda2 == true then
					setProperty('tb2.alpha', 0)
				else
					setProperty('tb2.visible', false)
				end
			
		elseif value1 == '2' then
			setProperty('camGame.bgColor', getColorFromHex('000000'))
			setProperty('bgColor.visible', false)
			setProperty('RightBar.visible', true)
			setProperty('LeftBar.visible', true)
			setProperty('lv1.alpha', 0)
			setProperty('lv2.alpha', 1)
			setProperty('lv2In.alpha', 0)
			setProperty('lv4.alpha', 0)
			setProperty('fb1.alpha', 0)
			setProperty('fb2.alpha', 0)
			setProperty('fb3.alpha', 0)
			setProperty('box.alpha', 0)
			
			setProperty('boyfriendGroup.x', 257)
			setProperty('boyfriendGroup.y', 150)
			
				if aparecemierda1 == true then
					setProperty('tb1.alpha', 1)
					setProperty('gfGroup.x', 205)
					setProperty('gfGroup.y', 116)
				else
					setProperty('tb1.visible', false)
					setProperty('gfGroup.x', 60)
					setProperty('gfGroup.y', 260)
				end
			
				if aparecemierda2 == true then
					setProperty('tb2.alpha', 0)
				else
					setProperty('tb2.visible', false)
				end
				
				if teveoelhoyo == true then
					setProperty('gfGroup.visible', true)
				else
					setProperty('gfGroup.visible', false)
				end
				
		elseif value1 == '3' then
			setProperty('camGame.bgColor', getColorFromHex('000000'))
			setProperty('bgColor.visible', false)
			setProperty('RightBar.visible', false)
			setProperty('LeftBar.visible', false)
			setProperty('lv1.alpha', 0)
			setProperty('lv2.alpha', 0)
			setProperty('lv2In.alpha', 0)
			setProperty('lv4.alpha', 1)
			setProperty('fb1.alpha', 1)
			setProperty('fb2.alpha', 1)
			setProperty('fb3.alpha', 1)
			setProperty('box.alpha', 0)
			
			setProperty('boyfriendGroup.x', 418)
			setProperty('boyfriendGroup.y', 231)
			
			setProperty('gfGroup.visible', false)
			
				if aparecemierda1 == true then
					setProperty('tb1.alpha', 0)
				else
					setProperty('tb1.visible', false)
				end
			
				if aparecemierda2 == true then
					setProperty('tb2.alpha', 0)
				else
					setProperty('tb2.visible', false)
				end
				
		elseif value1 == '4' then
			setProperty('camGame.bgColor', getColorFromHex('000000'))
			setProperty('bgColor.visible', false)
			setProperty('RightBar.visible', true)
			setProperty('LeftBar.visible', true)
			setProperty('lv1.alpha', 0)
			setProperty('lv2.alpha', 0)
			setProperty('lv2In.alpha', 1)
			setProperty('lv4.alpha', 0)
			setProperty('fb1.alpha', 0)
			setProperty('fb2.alpha', 0)
			setProperty('fb3.alpha', 0)
			setProperty('box.alpha', 0)
			
			setProperty('gfGroup.x', 31)
			setProperty('gfGroup.y', 260)
			
			setProperty('boyfriendGroup.alpha', 0)
			setProperty('gfGroup.visible', true)
			
				if aparecemierda1 == true then
					setProperty('tb1.alpha', 0)
				else
					setProperty('tb1.visible', false)
				end
			
				if aparecemierda2 == true then
					setProperty('tb2.alpha', 1)
				else
					setProperty('tb2.visible', false)
				end
		end
	end
	
	if name == 'Lvl Things' then
		if value1 == '1' and aparecemierda1 == true then
			doTweenY('tb1Y', 'tb1', 126, value2, 'SineIn')
			aparecemierda1 = false
		elseif value1 == '2' and aparecemierda2 == true then
			doTweenY('tb2Y', 'tb2', 420, value2, 'QuadInOut')
			doTweenY('gfGroupY', 'gfGroup', 380, value2, 'QuadInOut')
			aparecemierda2 = false
		end
	end
end

function onBeatHit()
	if curBeat % 2 == 0 then
		setProperty('bgColor.alpha', 0.25)
		doTweenAlpha('bgColorTween', 'bgColor', 0, 1, 'QuadInOut')
	end
end

function onStepHit()
	if curStep == 2096 and curStep <= 2724 then
		setProperty('gfGroup.x', 123)
		setProperty('gfGroup.y', 120)
	end
	
	if curStep == 3256 and teveoelhoyo == true then
		teveoelhoyo = false
	end
end

function onUpdate(Elapsed)
	-- Rotate FireBalls Lol
	setProperty('fb1.angle', getProperty('fb1.angle') + 2.1)
	setProperty('fb2.angle', getProperty('fb2.angle') + 2)
	setProperty('fb3.angle', getProperty('fb3.angle') + 2.125)
end
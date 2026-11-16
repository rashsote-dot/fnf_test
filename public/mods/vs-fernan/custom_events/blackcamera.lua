local Locate2 = 'stages/screens/'

function onCreatePost()
	--Screen 1
	makeLuaSprite('sc1', Locate2..'screen1', 0, 0)
	setProperty('sc1.antialiasing', false)
	setObjectCamera('sc1', 'other')
	setProperty('sc1.alpha', 0)
	screenCenter('sc1', 'xy')
	scaleObject('sc1', 1, 1)
	
	--Screen 2
	makeLuaSprite('sc2', Locate2..'screen2', 580, 310)
	setProperty('sc2.antialiasing', true)
	setObjectCamera('sc2', 'other')
	setProperty('sc2.alpha', 0)
	--screenCenter('sc2', 'xy')
	scaleObject('sc2', 0.1, 0.1)
	
	--black
	makeLuaSprite('black', empty, -15, -15)
	makeGraphic('black', 1310, 750, '000000')
	setProperty('black.antialiasing', false)
	setObjectCamera('black', 'other')
	setBlendMode('black', 'normal')
	
	--Add Sprites
	addLuaSprite('black', false)
	addLuaSprite('sc1', true)
	addLuaSprite('sc2', true)
end

function onEvent(name, value1, value2)
	if name == 'blackcamera' then
		doTweenAlpha('blackAlpha', 'black', value1, value2, 'QuadInOut')
	end
end
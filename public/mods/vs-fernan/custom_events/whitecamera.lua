function onCreatePost()
	makeLuaSprite('white', empty, -15, -15)
	makeGraphic('white', 1310, 750, 'FFFFFF')
	setProperty('white.antialiasing', false)
	setProperty('white.alpha', 0)
	setObjectCamera('white', 'other')
	setBlendMode('white', 'normal')
	addLuaSprite('white', true)
end

function onEvent(name, value1, value2)
	if name == 'Whitecamera' then
		--setProperty('white.alpha', 1)
		doTweenAlpha('whiteAlpha', 'white', value1, value2, 'QuadInOut')
	end
end
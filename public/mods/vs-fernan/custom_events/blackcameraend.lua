--[[
function onCreatePost()
	makeLuaSprite('black', empty, -15, -15)
	makeGraphic('black', 1310, 750, '000000')
	setProperty('black.antialiasing', false)
	setObjectCamera('black', 'other')
	setBlendMode('black', 'normal')
	addLuaSprite('black', true)
end
--]]

function onEvent(name, value1, value2)
	if name == 'blackcameraEnd' then
		doTweenAlpha('blackAlpha', 'black', 1, value1, value2)
	end
end
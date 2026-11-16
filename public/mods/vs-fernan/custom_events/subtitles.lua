--Evento Sacado del Nevados' Gallery, Programado por Josno (Yo)
--Tienes el permiso de modificarlo o mejorarlo a tu gusto!

--[[
	-- [Default Config] --
easingStyle = 'linearOut'
textSize = 25
objectCamera = 'other'
textBorderSize = '0'
textAlignment = 'Left'
textColor = 'FFFFFF'
textColor2 = '000000'
fontName = 'NotoSans-SemiBold.ttf'
pendejo = false
apareceMierda = false
--]]

	-- [Easy Config] --
local easingStyle = 'linearOut'
local textSize = 25
local objectCamera = 'other'
local textBorderSize = '0'
local textAlignment = 'Left'
local textColor = 'FFFFFF'
local textColor2 = '000000'
local fontName = 'YoutubeRoboto-Regular.ttf'
local pendejo = false
apareceMierda = false

local enableSubtitles = getModSetting("YTS")

function onEvent(name, value1, value2)
	if enableSubtitles then
		if name == 'Subtitles' then
			--Lyric
			makeLuaText('Lyric', value1, 0, 200, 600)
			setObjectOrder('Lyric', getObjectOrder('blackVignette') + 3)
			setTextBorder('Lyric', textBorderSize, textColor2)
			setTextAlignment('Lyric', textAlignment)
			setProperty('Lyric.visible', true)
			setObjectCamera('Lyric', objectCamera)
			setTextColor('Lyric', textColor)
			setTextSize('Lyric', textSize)
			setTextFont('Lyric', fontName)
			addLuaText('Lyric')
			
			--Lyric Bg
			makeLuaSprite('blackfont', 'empty', getProperty('Lyric.x') - 1.5, getProperty('Lyric.y') + 2)
			setObjectOrder('blackfont', getObjectOrder('Lyric') - 1)
			makeGraphic('blackfont', 1, 30, textColor2)
			setProperty('blackfont.visible', true)
			setObjectCamera('blackfont', objectCamera)
			setProperty('blackfont.scale.x', 0)
			setProperty('blackfont.origin.x', 0)
			setProperty('blackfont.alpha', 0.75)
			addLuaSprite('blackfont')
			
			--Aparece Mierda
			apareceMierda = true
			setProperty('blackfont.scale.x', getTextWidth('Lyric') + 5)
		end
		
		if value1 == '' then
			setProperty('Lyric.visible', false)
			setProperty('blackfont.visible', false)
		end
	end
end

function onCreatePost()
	if enableSubtitles then
		--Red Line
		makeAnimatedLuaSprite('redline', 'stages/customYoutubeHud/redline', 1121.50, 705.95)
		addAnimationByPrefix('redline', 'ola', 'redline', 60, false)
		setProperty('redline.visible', false)
		setObjectCamera('redline', 'other')
		
		--[[
		--Grr Subtituos activados
		makeLuaSprite('grr', 'stages/customYoutubeHud/grrsubtitulos', 87.5, 82.4)
		setObjectCamera('grr', objectCamera)
		setProperty('grr.visible', false)
		--]]
		
		--Add
		addLuaSprite('redline')
		--addLuaSprite('grr')
	end
end

function onUpdatePost()
	if enableSubtitles then
		if (apareceMierda == true and not pendejo) then
			--Propiedades
			--setProperty('grr.visible', true)
			setProperty('redline.visible', true)
			
			objectPlayAnimation('redline', 'ola', false)
			--runTimer('grr', 3)
			
			pendejo = true
		end
	end
end

function onTimerCompleted(tag, loops, loopsLeft)
	if enableSubtitles then
		if tag == 'grr' then
			--removeLuaSprite('grr', true)
		end
	end
end